/**
 * 让 Node 的测试运行器能解析裸导入 `three`。
 *
 * 浏览器端靠页面里的 importmap 把 "three" 指向 js/vendor/three.module.min.js，
 * Node 没有 importmap，所以这里用一个 resolve 钩子做同样的映射，
 * 免得为了跑测试而往仓库里塞 node_modules。
 *
 * 用法：
 *   node --import ./server/three-test-resolver.mjs --test js/backrooms-level-c1-world.test.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const VENDOR_THREE = new URL("../js/vendor/three.module.min.js", import.meta.url).href;

register(
  "data:text/javascript," +
    encodeURIComponent(
      `export function resolve(specifier, context, next) {
         if (specifier === "three") {
           return { url: ${JSON.stringify(VENDOR_THREE)}, shortCircuit: true };
         }
         return next(specifier, context);
       }`
    ),
  pathToFileURL("./")
);
