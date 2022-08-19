/*
 * @Author: yanding.li David.Jackson.Lyd@gmail.com
 * @Date: 2022-08-18 22:23:02
 * @LastEditors: yanding.li David.Jackson.Lyd@gmail.com
 * @LastEditTime: 2022-08-18 23:34:47
 * @FilePath: \vuejs-core\packages\vue\src\index.ts
 * @Description: 
 * 
 * Copyright (c) 2022 by yanding.li David.Jackson.Lyd@gmail.com, All Rights Reserved. 
 */

// This entry is the "full-build" that includes both the runtime
// and the compiler, and supports on-the-fly compilation of the template option.
import { initDev } from './dev'
import { compile, CompilerOptions, CompilerError } from '@vue/compiler-dom'
import { registerRuntimeCompiler, RenderFunction, warn } from '@vue/runtime-dom'
import * as runtimeDom from '@vue/runtime-dom'
import { isString, NOOP, generateCodeFrame, extend } from '@vue/shared'
import { InternalRenderFunction } from 'packages/runtime-core/src/component'

if (__DEV__) {
  initDev()
}

const compileCache: Record<string, RenderFunction> = Object.create(null)

function compileToFunction(
  template: string | HTMLElement,
  options?: CompilerOptions
): RenderFunction {
  if (!isString(template)) {
    if (template.nodeType) {
      template = template.innerHTML
    } else {
      __DEV__ && warn(`invalid template option: `, template)
      return NOOP
    }
  }

  const key = template
  const cached = compileCache[key]
  // 有一个 if 分支做缓存的判断，如果该模板之前被缓存过，则不再进行编译，直接返回缓存中的 render 函数，以此提高性能。
  if (cached) {
    return cached
  }

  if (template[0] === '#') {
    const el = document.querySelector(template)
    if (__DEV__ && !el) {
      warn(`Template element not found or is empty: ${template}`)
    }
    // __UNSAFE__
    // Reason: potential execution of JS expressions in in-DOM template.
    // The user must make sure the in-DOM template is trusted. If it's rendered
    // by the server, the template should not contain any user data.
    template = el ? el.innerHTML : ``
  }

  /**
   *  调用了 compile-dom 库提供的 compile 函数，从返回值中解构出了 code 变量。这个就是编译器执行之后生成的编译结果，code 是编译结果的其中一个参数，是一个代码字符串。
   *  例如：<template>
            <div>
              Hello World
            </div>
          </template>
      const _Vue = Vue return function render(_ctx, _cache) {
        with (_ctx) {
          const {
            openBlock: _openBlock, createBlock: _createBlock
          } = _Vue
          return (_openBlock(), _createBlock("div", null, "Hello World"))
        }
      }

      最有意思的部分就是调用 compile 函数编译出了代码字符串，所以接下来我将围绕 compile 函数来接着唠。compile 函数牵扯到 compile-dom 和 compile-core 两个模块
   */
  const { code } = compile(
    template,
    extend(
      {
        hoistStatic: true,
        onError: __DEV__ ? onError : undefined,
        onWarn: __DEV__ ? e => onError(e, true) : NOOP
      } as CompilerOptions,
      options
    )
  )

  function onError(err: CompilerError, asWarning = false) {
    const message = asWarning
      ? err.message
      : `Template compilation error: ${err.message}`
    const codeFrame =
      err.loc &&
      generateCodeFrame(
        template as string,
        err.loc.start.offset,
        err.loc.end.offset
      )
    warn(codeFrame ? `${message}\n${codeFrame}` : message)
  }

  // The wildcard import results in a huge object with every export
  // with keys that cannot be mangled, and can be quite heavy size-wise.
  // In the global build we know `Vue` is available globally so we can avoid
  // the wildcard object.
  /** 
   * 声明了一个 render 变量，并且将生成的代码字符串 code 作为参数传入了 new Function 构造函数。
   * 可以将我放在上面的 code 字符串格式化，能够发现 render 函数是一个柯里化的函数，返回了一个函数，函数内部通过 with 来扩展作用域链。
  */
  const render = (
    __GLOBAL__ ? new Function(code)() : new Function('Vue', code)(runtimeDom)
  ) as RenderFunction

  // mark the function as runtime compiled
  ;(render as InternalRenderFunction)._rc = true

  // 文件返回了 render 变量，并且顺手缓存了 render 函数。
  return (compileCache[key] = render)
}



/**
 * 我是从这里开始啃（面包）源码的 -_-    2022-08-18
 * 调用了 registerRuntiomCompiler 函数，将 compileToFunction 函数作为参数传入，
 * 通过依赖注入的方式，将 compile 函数注入至 runtime 运行时中，
 * 依赖注入是一种比较巧妙的解耦方式，此时运行时再调用 compile 编译函数，就是在调用当前的 compileToFunction 函数了。 
 */
registerRuntimeCompiler(compileToFunction)

export { compileToFunction as compile }
export * from '@vue/runtime-dom'
