import { CompilerOptions } from './options'
import { baseParse } from './parse'
import { transform, NodeTransform, DirectiveTransform } from './transform'
import { generate, CodegenResult } from './codegen'
import { RootNode } from './ast'
import { isString, extend } from '@vue/shared'
import { transformIf } from './transforms/vIf'
import { transformFor } from './transforms/vFor'
import { transformExpression } from './transforms/transformExpression'
import { transformSlotOutlet } from './transforms/transformSlotOutlet'
import { transformElement } from './transforms/transformElement'
import { transformOn } from './transforms/vOn'
import { transformBind } from './transforms/vBind'
import { trackSlotScopes, trackVForSlotScopes } from './transforms/vSlot'
import { transformText } from './transforms/transformText'
import { transformOnce } from './transforms/vOnce'
import { transformModel } from './transforms/vModel'
import { transformFilter } from './compat/transformFilter'
import { defaultOnError, createCompilerError, ErrorCodes } from './errors'
import { transformMemo } from './transforms/vMemo'

export type TransformPreset = [
  NodeTransform[],
  Record<string, DirectiveTransform>
]

export function getBaseTransformPreset(
  prefixIdentifiers?: boolean
): TransformPreset {
  return [
    [
      transformOnce,
      transformIf,
      transformMemo,
      transformFor,
      ...(__COMPAT__ ? [transformFilter] : []),
      ...(!__BROWSER__ && prefixIdentifiers
        ? [
            // order is important
            trackVForSlotScopes,
            transformExpression
          ]
        : __BROWSER__ && __DEV__
        ? [transformExpression]
        : []),
      transformSlotOutlet,
      transformElement,
      trackSlotScopes,
      transformText
    ],
    {
      on: transformOn,
      bind: transformBind,
      model: transformModel
    }
  ]
}

// we name it `baseCompile` so that higher order compilers like
// @vue/compiler-dom can export `compile` while re-exporting everything else.

/*  1. 为什么会有 baseCompile 这样的命名呢？因为 compile-core 是编译的核心模块，接受外部的参数来按照规则完成编译，
    而 compile-dom 是专门处理浏览器场景下的编译，在这个模块下导出的 compile 函数是入口文件真正接收的编译函数。
    而 compile-dom 中的 compile 函数相对 baseCompile 也是更高阶的一个编译器。例如当 Vue 在 weex 在 iOS 或者 Android 这些 Native App 中工作时，
    compile-dom 可能会被相关的移动端编译库来取代。
    2. 先从函数声明中来看，baseCompile 接收 template 模板以及上层高阶编译器中处理过 options 编译选项，最终返回一个 CodegenResult 类型的编译结果。
    通过 CodegenResult 的接口声明能清晰的看到返回结果中存在 code 代码字符串、处理后的 AST 抽象语法树，以及 sourceMap。

    export interface CodegenResult {
      code: string
      preamble: string
      ast: RootNode
      map?: RawSourceMap
    }

 */
export function baseCompile(
  template: string | RootNode,
  options: CompilerOptions = {}
): CodegenResult {
  const onError = options.onError || defaultOnError
  const isModuleMode = options.mode === 'module'
  /* istanbul ignore if */
  if (__BROWSER__) {
    if (options.prefixIdentifiers === true) {
      onError(createCompilerError(ErrorCodes.X_PREFIX_ID_NOT_SUPPORTED))
    } else if (isModuleMode) {
      onError(createCompilerError(ErrorCodes.X_MODULE_MODE_NOT_SUPPORTED))
    }
  }

  const prefixIdentifiers =
    !__BROWSER__ && (options.prefixIdentifiers === true || isModuleMode)
  if (!prefixIdentifiers && options.cacheHandlers) {
    onError(createCompilerError(ErrorCodes.X_CACHE_HANDLER_NOT_SUPPORTED))
  }
  if (options.scopeId && !isModuleMode) {
    onError(createCompilerError(ErrorCodes.X_SCOPE_ID_NOT_SUPPORTED))
  }

  /* 
    判断 template 模板是否为字符串，如果是的话则会对字符串进行解析，否则直接将 template 作为 AST 。其实我们平时在写的单文件 vue 代码，都是以字符串的形式传递进去的。
  */
  const ast = isString(template) ? baseParse(template, options) : template
  const [nodeTransforms, directiveTransforms] =
    getBaseTransformPreset(prefixIdentifiers)

  if (!__BROWSER__ && options.isTS) {
    const { expressionPlugins } = options
    if (!expressionPlugins || !expressionPlugins.includes('typescript')) {
      options.expressionPlugins = [...(expressionPlugins || []), 'typescript']
    }
  }

  // 调用了 transform 函数，以及传入了指令转换、节点转换等工具函数，对由模板生成的 AST 进行转换。
  transform(
    ast,
    extend({}, options, {
      prefixIdentifiers,
      nodeTransforms: [
        ...nodeTransforms,
        ...(options.nodeTransforms || []) // user transforms
      ],
      directiveTransforms: extend(
        {},
        directiveTransforms,
        options.directiveTransforms || {} // user transforms
      )
    })
  )

  // 我们将转换好的 AST 传入 generate，生成 CodegenResult 类型的返回结果。
  // 在 compile-core 模块中，AST 解析、transform、codegen、compile、parse 这些函数都是一个单独的小模块，内部的实现都非常精妙
  return generate(
    ast,
    extend({}, options, {
      prefixIdentifiers
    })
  )
}
