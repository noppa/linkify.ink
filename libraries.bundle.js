var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x3) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x3, {
  get: (a3, b3) => (typeof require !== "undefined" ? require : a3)[b3]
}) : x3)(function(x3) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x3 + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key2 of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key2) && key2 !== except)
        __defProp(to, key2, { get: () => from[key2], enumerable: !(desc = __getOwnPropDesc(from, key2)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/argon2-browser/dist/argon2.js
var require_argon2 = __commonJS({
  "node_modules/argon2-browser/dist/argon2.js"(exports, module) {
    var Module3 = typeof self !== "undefined" && typeof self.Module !== "undefined" ? self.Module : {};
    var jsModule = Module3;
    var moduleOverrides2 = {};
    var key2;
    for (key2 in Module3) {
      if (Module3.hasOwnProperty(key2)) {
        moduleOverrides2[key2] = Module3[key2];
      }
    }
    var arguments_2 = [];
    var thisProgram2 = "./this.program";
    var quit_2 = function(status, toThrow) {
      throw toThrow;
    };
    var ENVIRONMENT_IS_WEB = false;
    var ENVIRONMENT_IS_WORKER = false;
    var ENVIRONMENT_IS_NODE = false;
    var ENVIRONMENT_IS_SHELL = false;
    ENVIRONMENT_IS_WEB = typeof window === "object";
    ENVIRONMENT_IS_WORKER = typeof importScripts === "function";
    ENVIRONMENT_IS_NODE = typeof process === "object" && typeof process.versions === "object" && typeof process.versions.node === "string";
    ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
    var scriptDirectory = "";
    function locateFile(path) {
      if (Module3["locateFile"]) {
        return Module3["locateFile"](path, scriptDirectory);
      }
      return scriptDirectory + path;
    }
    var read_;
    var readAsync;
    var readBinary;
    var setWindowTitle;
    var nodeFS;
    var nodePath;
    if (ENVIRONMENT_IS_NODE) {
      if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = __require("path").dirname(scriptDirectory) + "/";
      } else {
        scriptDirectory = __dirname + "/";
      }
      read_ = function shell_read(filename, binary) {
        if (!nodeFS) nodeFS = __require("fs");
        if (!nodePath) nodePath = __require("path");
        filename = nodePath["normalize"](filename);
        return nodeFS["readFileSync"](filename, binary ? null : "utf8");
      };
      readBinary = function readBinary2(filename) {
        var ret = read_(filename, true);
        if (!ret.buffer) {
          ret = new Uint8Array(ret);
        }
        assert(ret.buffer);
        return ret;
      };
      if (process["argv"].length > 1) {
        thisProgram2 = process["argv"][1].replace(/\\/g, "/");
      }
      arguments_2 = process["argv"].slice(2);
      if (typeof module !== "undefined") {
        module["exports"] = Module3;
      }
      process["on"]("uncaughtException", function(ex) {
        if (!(ex instanceof ExitStatus2)) {
          throw ex;
        }
      });
      process["on"]("unhandledRejection", abort2);
      quit_2 = function(status) {
        process["exit"](status);
      };
      Module3["inspect"] = function() {
        return "[Emscripten Module object]";
      };
    } else if (ENVIRONMENT_IS_SHELL) {
      if (typeof read != "undefined") {
        read_ = function shell_read(f3) {
          return read(f3);
        };
      }
      readBinary = function readBinary2(f3) {
        var data;
        if (typeof readbuffer === "function") {
          return new Uint8Array(readbuffer(f3));
        }
        data = read(f3, "binary");
        assert(typeof data === "object");
        return data;
      };
      if (typeof scriptArgs != "undefined") {
        arguments_2 = scriptArgs;
      } else if (typeof arguments != "undefined") {
        arguments_2 = arguments;
      }
      if (typeof quit === "function") {
        quit_2 = function(status) {
          quit(status);
        };
      }
      if (typeof print !== "undefined") {
        if (typeof console === "undefined") console = {};
        console.log = print;
        console.warn = console.error = typeof printErr !== "undefined" ? printErr : print;
      }
    } else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
      if (ENVIRONMENT_IS_WORKER) {
        scriptDirectory = self.location.href;
      } else if (typeof document !== "undefined" && document.currentScript) {
        scriptDirectory = document.currentScript.src;
      }
      if (scriptDirectory.indexOf("blob:") !== 0) {
        scriptDirectory = scriptDirectory.substr(0, scriptDirectory.lastIndexOf("/") + 1);
      } else {
        scriptDirectory = "";
      }
      {
        read_ = function(url) {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, false);
          xhr.send(null);
          return xhr.responseText;
        };
        if (ENVIRONMENT_IS_WORKER) {
          readBinary = function(url) {
            var xhr = new XMLHttpRequest();
            xhr.open("GET", url, false);
            xhr.responseType = "arraybuffer";
            xhr.send(null);
            return new Uint8Array(xhr.response);
          };
        }
        readAsync = function(url, onload, onerror) {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", url, true);
          xhr.responseType = "arraybuffer";
          xhr.onload = function() {
            if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
              onload(xhr.response);
              return;
            }
            onerror();
          };
          xhr.onerror = onerror;
          xhr.send(null);
        };
      }
      setWindowTitle = function(title) {
        document.title = title;
      };
    } else {
    }
    var out = Module3["print"] || console.log.bind(console);
    var err2 = Module3["printErr"] || console.warn.bind(console);
    for (key2 in moduleOverrides2) {
      if (moduleOverrides2.hasOwnProperty(key2)) {
        Module3[key2] = moduleOverrides2[key2];
      }
    }
    moduleOverrides2 = null;
    if (Module3["arguments"]) arguments_2 = Module3["arguments"];
    if (Module3["thisProgram"]) thisProgram2 = Module3["thisProgram"];
    if (Module3["quit"]) quit_2 = Module3["quit"];
    var wasmBinary;
    if (Module3["wasmBinary"]) wasmBinary = Module3["wasmBinary"];
    var noExitRuntime2 = Module3["noExitRuntime"] || true;
    if (typeof WebAssembly !== "object") {
      abort2("no native wasm support detected");
    }
    var wasmMemory2;
    var ABORT2 = false;
    var EXITSTATUS2;
    function assert(condition, text) {
      if (!condition) {
        abort2("Assertion failed: " + text);
      }
    }
    var ALLOC_NORMAL = 0;
    var ALLOC_STACK = 1;
    function allocate(slab, allocator) {
      var ret;
      if (allocator == ALLOC_STACK) {
        ret = stackAlloc(slab.length);
      } else {
        ret = _malloc2(slab.length);
      }
      if (slab.subarray || slab.slice) {
        HEAPU82.set(slab, ret);
      } else {
        HEAPU82.set(new Uint8Array(slab), ret);
      }
      return ret;
    }
    var UTF8Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf8") : void 0;
    function UTF8ArrayToString(heap, idx, maxBytesToRead) {
      var endIdx = idx + maxBytesToRead;
      var endPtr = idx;
      while (heap[endPtr] && !(endPtr >= endIdx)) ++endPtr;
      if (endPtr - idx > 16 && heap.subarray && UTF8Decoder) {
        return UTF8Decoder.decode(heap.subarray(idx, endPtr));
      } else {
        var str = "";
        while (idx < endPtr) {
          var u0 = heap[idx++];
          if (!(u0 & 128)) {
            str += String.fromCharCode(u0);
            continue;
          }
          var u1 = heap[idx++] & 63;
          if ((u0 & 224) == 192) {
            str += String.fromCharCode((u0 & 31) << 6 | u1);
            continue;
          }
          var u22 = heap[idx++] & 63;
          if ((u0 & 240) == 224) {
            u0 = (u0 & 15) << 12 | u1 << 6 | u22;
          } else {
            u0 = (u0 & 7) << 18 | u1 << 12 | u22 << 6 | heap[idx++] & 63;
          }
          if (u0 < 65536) {
            str += String.fromCharCode(u0);
          } else {
            var ch = u0 - 65536;
            str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023);
          }
        }
      }
      return str;
    }
    function UTF8ToString(ptr, maxBytesToRead) {
      return ptr ? UTF8ArrayToString(HEAPU82, ptr, maxBytesToRead) : "";
    }
    function alignUp(x3, multiple) {
      if (x3 % multiple > 0) {
        x3 += multiple - x3 % multiple;
      }
      return x3;
    }
    var buffer;
    var HEAP82;
    var HEAPU82;
    var HEAP16;
    var HEAPU16;
    var HEAP32;
    var HEAPU32;
    var HEAPF32;
    var HEAPF64;
    function updateGlobalBufferAndViews(buf) {
      buffer = buf;
      Module3["HEAP8"] = HEAP82 = new Int8Array(buf);
      Module3["HEAP16"] = HEAP16 = new Int16Array(buf);
      Module3["HEAP32"] = HEAP32 = new Int32Array(buf);
      Module3["HEAPU8"] = HEAPU82 = new Uint8Array(buf);
      Module3["HEAPU16"] = HEAPU16 = new Uint16Array(buf);
      Module3["HEAPU32"] = HEAPU32 = new Uint32Array(buf);
      Module3["HEAPF32"] = HEAPF32 = new Float32Array(buf);
      Module3["HEAPF64"] = HEAPF64 = new Float64Array(buf);
    }
    var INITIAL_MEMORY = Module3["INITIAL_MEMORY"] || 16777216;
    var wasmTable;
    var __ATPRERUN__2 = [];
    var __ATINIT__2 = [];
    var __ATPOSTRUN__2 = [];
    var runtimeInitialized2 = false;
    function preRun2() {
      if (Module3["preRun"]) {
        if (typeof Module3["preRun"] == "function") Module3["preRun"] = [Module3["preRun"]];
        while (Module3["preRun"].length) {
          addOnPreRun2(Module3["preRun"].shift());
        }
      }
      callRuntimeCallbacks2(__ATPRERUN__2);
    }
    function initRuntime2() {
      runtimeInitialized2 = true;
      callRuntimeCallbacks2(__ATINIT__2);
    }
    function postRun2() {
      if (Module3["postRun"]) {
        if (typeof Module3["postRun"] == "function") Module3["postRun"] = [Module3["postRun"]];
        while (Module3["postRun"].length) {
          addOnPostRun2(Module3["postRun"].shift());
        }
      }
      callRuntimeCallbacks2(__ATPOSTRUN__2);
    }
    function addOnPreRun2(cb) {
      __ATPRERUN__2.unshift(cb);
    }
    function addOnInit2(cb) {
      __ATINIT__2.unshift(cb);
    }
    function addOnPostRun2(cb) {
      __ATPOSTRUN__2.unshift(cb);
    }
    var runDependencies2 = 0;
    var runDependencyWatcher = null;
    var dependenciesFulfilled2 = null;
    function addRunDependency2(id) {
      runDependencies2++;
      if (Module3["monitorRunDependencies"]) {
        Module3["monitorRunDependencies"](runDependencies2);
      }
    }
    function removeRunDependency2(id) {
      runDependencies2--;
      if (Module3["monitorRunDependencies"]) {
        Module3["monitorRunDependencies"](runDependencies2);
      }
      if (runDependencies2 == 0) {
        if (runDependencyWatcher !== null) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
        }
        if (dependenciesFulfilled2) {
          var callback = dependenciesFulfilled2;
          dependenciesFulfilled2 = null;
          callback();
        }
      }
    }
    Module3["preloadedImages"] = {};
    Module3["preloadedAudios"] = {};
    function abort2(what) {
      if (Module3["onAbort"]) {
        Module3["onAbort"](what);
      }
      what += "";
      err2(what);
      ABORT2 = true;
      EXITSTATUS2 = 1;
      what = "abort(" + what + "). Build with -s ASSERTIONS=1 for more info.";
      var e3 = new WebAssembly.RuntimeError(what);
      throw e3;
    }
    var dataURIPrefix = "data:application/octet-stream;base64,";
    function isDataURI(filename) {
      return filename.startsWith(dataURIPrefix);
    }
    function isFileURI(filename) {
      return filename.startsWith("file://");
    }
    var wasmBinaryFile = "argon2.wasm";
    if (!isDataURI(wasmBinaryFile)) {
      wasmBinaryFile = locateFile(wasmBinaryFile);
    }
    function getBinary(file) {
      try {
        if (file == wasmBinaryFile && wasmBinary) {
          return new Uint8Array(wasmBinary);
        }
        if (readBinary) {
          return readBinary(file);
        } else {
          throw "both async and sync fetching of the wasm failed";
        }
      } catch (err3) {
        abort2(err3);
      }
    }
    function getBinaryPromise2() {
      if (!wasmBinary && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER)) {
        if (typeof fetch === "function" && !isFileURI(wasmBinaryFile)) {
          return fetch(wasmBinaryFile, { credentials: "same-origin" }).then(function(response) {
            if (!response["ok"]) {
              throw "failed to load wasm binary file at '" + wasmBinaryFile + "'";
            }
            return response["arrayBuffer"]();
          }).catch(function() {
            return getBinary(wasmBinaryFile);
          });
        } else {
          if (readAsync) {
            return new Promise(function(resolve, reject) {
              readAsync(wasmBinaryFile, function(response) {
                resolve(new Uint8Array(response));
              }, reject);
            });
          }
        }
      }
      return Promise.resolve().then(function() {
        return getBinary(wasmBinaryFile);
      });
    }
    function createWasm() {
      var info = { "a": asmLibraryArg };
      function receiveInstance(instance, module2) {
        var exports3 = instance.exports;
        Module3["asm"] = exports3;
        wasmMemory2 = Module3["asm"]["c"];
        updateGlobalBufferAndViews(wasmMemory2.buffer);
        wasmTable = Module3["asm"]["k"];
        addOnInit2(Module3["asm"]["d"]);
        removeRunDependency2("wasm-instantiate");
      }
      addRunDependency2("wasm-instantiate");
      function receiveInstantiationResult(result) {
        receiveInstance(result["instance"]);
      }
      function instantiateArrayBuffer(receiver) {
        return getBinaryPromise2().then(function(binary) {
          var result = WebAssembly.instantiate(binary, info);
          return result;
        }).then(receiver, function(reason) {
          err2("failed to asynchronously prepare wasm: " + reason);
          abort2(reason);
        });
      }
      function instantiateAsync() {
        if (!wasmBinary && typeof WebAssembly.instantiateStreaming === "function" && !isDataURI(wasmBinaryFile) && !isFileURI(wasmBinaryFile) && typeof fetch === "function") {
          return fetch(wasmBinaryFile, { credentials: "same-origin" }).then(function(response) {
            var result = WebAssembly.instantiateStreaming(response, info);
            return result.then(receiveInstantiationResult, function(reason) {
              err2("wasm streaming compile failed: " + reason);
              err2("falling back to ArrayBuffer instantiation");
              return instantiateArrayBuffer(receiveInstantiationResult);
            });
          });
        } else {
          return instantiateArrayBuffer(receiveInstantiationResult);
        }
      }
      if (Module3["instantiateWasm"]) {
        try {
          var exports2 = Module3["instantiateWasm"](info, receiveInstance);
          return exports2;
        } catch (e3) {
          err2("Module.instantiateWasm callback failed with error: " + e3);
          return false;
        }
      }
      instantiateAsync();
      return {};
    }
    function callRuntimeCallbacks2(callbacks) {
      while (callbacks.length > 0) {
        var callback = callbacks.shift();
        if (typeof callback == "function") {
          callback(Module3);
          continue;
        }
        var func = callback.func;
        if (typeof func === "number") {
          if (callback.arg === void 0) {
            wasmTable.get(func)();
          } else {
            wasmTable.get(func)(callback.arg);
          }
        } else {
          func(callback.arg === void 0 ? null : callback.arg);
        }
      }
    }
    function _emscripten_memcpy_big(dest, src, num) {
      HEAPU82.copyWithin(dest, src, src + num);
    }
    function emscripten_realloc_buffer(size) {
      try {
        wasmMemory2.grow(size - buffer.byteLength + 65535 >>> 16);
        updateGlobalBufferAndViews(wasmMemory2.buffer);
        return 1;
      } catch (e3) {
      }
    }
    function _emscripten_resize_heap2(requestedSize) {
      var oldSize = HEAPU82.length;
      requestedSize = requestedSize >>> 0;
      var maxHeapSize = 2147418112;
      if (requestedSize > maxHeapSize) {
        return false;
      }
      for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
        var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
        overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
        var newSize = Math.min(maxHeapSize, alignUp(Math.max(requestedSize, overGrownHeapSize), 65536));
        var replacement = emscripten_realloc_buffer(newSize);
        if (replacement) {
          return true;
        }
      }
      return false;
    }
    var asmLibraryArg = { "a": _emscripten_memcpy_big, "b": _emscripten_resize_heap2 };
    var asm = createWasm();
    var ___wasm_call_ctors = Module3["___wasm_call_ctors"] = function() {
      return (___wasm_call_ctors = Module3["___wasm_call_ctors"] = Module3["asm"]["d"]).apply(null, arguments);
    };
    var _argon2_hash = Module3["_argon2_hash"] = function() {
      return (_argon2_hash = Module3["_argon2_hash"] = Module3["asm"]["e"]).apply(null, arguments);
    };
    var _malloc2 = Module3["_malloc"] = function() {
      return (_malloc2 = Module3["_malloc"] = Module3["asm"]["f"]).apply(null, arguments);
    };
    var _free2 = Module3["_free"] = function() {
      return (_free2 = Module3["_free"] = Module3["asm"]["g"]).apply(null, arguments);
    };
    var _argon2_verify = Module3["_argon2_verify"] = function() {
      return (_argon2_verify = Module3["_argon2_verify"] = Module3["asm"]["h"]).apply(null, arguments);
    };
    var _argon2_error_message = Module3["_argon2_error_message"] = function() {
      return (_argon2_error_message = Module3["_argon2_error_message"] = Module3["asm"]["i"]).apply(null, arguments);
    };
    var _argon2_encodedlen = Module3["_argon2_encodedlen"] = function() {
      return (_argon2_encodedlen = Module3["_argon2_encodedlen"] = Module3["asm"]["j"]).apply(null, arguments);
    };
    var _argon2_hash_ext = Module3["_argon2_hash_ext"] = function() {
      return (_argon2_hash_ext = Module3["_argon2_hash_ext"] = Module3["asm"]["l"]).apply(null, arguments);
    };
    var _argon2_verify_ext = Module3["_argon2_verify_ext"] = function() {
      return (_argon2_verify_ext = Module3["_argon2_verify_ext"] = Module3["asm"]["m"]).apply(null, arguments);
    };
    var stackAlloc = Module3["stackAlloc"] = function() {
      return (stackAlloc = Module3["stackAlloc"] = Module3["asm"]["n"]).apply(null, arguments);
    };
    Module3["allocate"] = allocate;
    Module3["UTF8ToString"] = UTF8ToString;
    Module3["ALLOC_NORMAL"] = ALLOC_NORMAL;
    var calledRun2;
    function ExitStatus2(status) {
      this.name = "ExitStatus";
      this.message = "Program terminated with exit(" + status + ")";
      this.status = status;
    }
    dependenciesFulfilled2 = function runCaller2() {
      if (!calledRun2) run2();
      if (!calledRun2) dependenciesFulfilled2 = runCaller2;
    };
    function run2(args) {
      args = args || arguments_2;
      if (runDependencies2 > 0) {
        return;
      }
      preRun2();
      if (runDependencies2 > 0) {
        return;
      }
      function doRun() {
        if (calledRun2) return;
        calledRun2 = true;
        Module3["calledRun"] = true;
        if (ABORT2) return;
        initRuntime2();
        if (Module3["onRuntimeInitialized"]) Module3["onRuntimeInitialized"]();
        postRun2();
      }
      if (Module3["setStatus"]) {
        Module3["setStatus"]("Running...");
        setTimeout(function() {
          setTimeout(function() {
            Module3["setStatus"]("");
          }, 1);
          doRun();
        }, 1);
      } else {
        doRun();
      }
    }
    Module3["run"] = run2;
    if (Module3["preInit"]) {
      if (typeof Module3["preInit"] == "function") Module3["preInit"] = [Module3["preInit"]];
      while (Module3["preInit"].length > 0) {
        Module3["preInit"].pop()();
      }
    }
    run2();
    if (typeof module !== "undefined") module.exports = Module3;
    Module3.unloadRuntime = function() {
      if (typeof self !== "undefined") {
        delete self.Module;
      }
      Module3 = jsModule = wasmMemory2 = wasmTable = asm = buffer = HEAP82 = HEAPU82 = HEAP16 = HEAPU16 = HEAP32 = HEAPU32 = HEAPF32 = HEAPF64 = void 0;
      if (typeof module !== "undefined") {
        delete module.exports;
      }
    };
  }
});

// node_modules/argon2-browser/dist/argon2.wasm
var require_argon22 = __commonJS({
  "node_modules/argon2-browser/dist/argon2.wasm"(exports, module) {
    module.exports = "data:application/wasm;base64,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DwtBixEPC0GeEyEBCyABC48DAQF/IwBBgANrIgQkACAEQQA2AowBIARBjAFqIAEQBwJAIAFBwABNBEAgBEGQAWogARAYQQBIDQEgBEGQAWogBEGMAWpBBBAGQQBIDQEgBEGQAWogAiADEAZBAEgNASAEQZABaiAAIAEQEhoMAQsgBEGQAWpBwAAQGEEASA0AIARBkAFqIARBjAFqQQQQBkEASA0AIARBkAFqIAIgAxAGQQBIDQAgBEGQAWogBEFAa0HAABASQQBIDQAgACAEKQNANwAAIAAgBCkDSDcACCAAIAQpA1g3ABggACAEKQNQNwAQIABBIGohACABQSBrIgJBwQBPBEADQCAEIARBQGtBwAAQBSIBQUBrQcAAIAEQMUEASA0CIAAgASkDQDcAACAAIAEpA0g3AAggACAEKQNYNwAYIAAgBCkDUDcAECAAQSBqIQAgAkEgayICQcAASw0ACwsgBCAEQUBrQcAAEAUiAUFAayACIAEQMUEASA0AIAAgAUFAayACEAUaCyAEQZABakHwARAEIARBgANqJAALAwABC5kCACAARQRAQQAPCwJ/AkAgAAR/IAFB/wBNDQECQEGgHigCACgCAEUEQCABQYB/cUGAvwNGDQMMAQsgAUH/D00EQCAAIAFBP3FBgAFyOgABIAAgAUEGdkHAAXI6AABBAgwECyABQYCwA09BACABQYBAcUGAwANHG0UEQCAAIAFBP3FBgAFyOgACIAAgAUEMdkHgAXI6AAAgACABQQZ2QT9xQYABcjoAAUEDDAQLIAFBgIAEa0H//z9NBEAgACABQT9xQYABcjoAAyAAIAFBEnZB8AFyOgAAIAAgAUEGdkE/cUGAAXI6AAIgACABQQx2QT9xQYABcjoAAUEEDAQLC0HcHkEZNgIAQX8FQQELDAELIAAgAToAAEEBCwtQAQN/AkAgACgCACwAABAPRQRADAELA0AgACgCACICLAAAIQMgACACQQFqNgIAIAEgA2pBMGshASACLAABEA9FDQEgAUEKbCEBDAALAAsgAQu7AgACQCABQRRLDQACQAJAAkACQAJAAkACQAJAAkACQCABQQlrDgoAAQIDBAUGBwgJCgsgAiACKAIAIgFBBGo2AgAgACABKAIANgIADwsgAiACKAIAIgFBBGo2AgAgACABNAIANwMADwsgAiACKAIAIgFBBGo2AgAgACABNQIANwMADwsgAiACKAIAQQdqQXhxIgFBCGo2AgAgACABKQMANwMADwsgAiACKAIAIgFBBGo2AgAgACABMgEANwMADwsgAiACKAIAIgFBBGo2AgAgACABMwEANwMADwsgAiACKAIAIgFBBGo2AgAgACABMAAANwMADwsgAiACKAIAIgFBBGo2AgAgACABMQAANwMADwsgAiACKAIAQQdqQXhxIgFBCGo2AgAgACABKwMAOQMADwsgACACQQARAgALCxkAIAAtAOgBBEAgAEJ/NwNYCyAAQn83A1ALIwAgASABKQMwQgF8NwMwIAIgASAAQQAQESACIAAgAEEAEBELOQECfyAAQQNuIgJBAnQhAQJAAkACQCACQQNsQX9zIABqDgIBAAILIAFBAXIhAQsgAUECaiEBCyABC3oBAn8gAEHA/wBzQQFqQQh2QX9zQS9xIABBwf8Ac0EBakEIdkF/c0ErcSAAQeb/A2pBCHZB/wFxIgEgAEHBAGpxcnIgAEHM/wNqQQh2IgIgAEHHAGpxIAFB/wFzcXIgAEH8AWogAEHC/wNqQQh2cSACQX9zcUH/AXFyC9YBAQV/QX8hBCADQQNuIgZBAnQhBQJAAkACQCAGQQNsQX9zIANqDgIBAAILIAVBAXIhBQsgBUECaiEFCyABIAVLBH8CQCADRQ0AQQAhAUEIIQQDQCABIAItAAAiCHIhBwNAIAAiASAHIAQiBkEGayIEdkE/cRAoOgAAIAFBAWohACAEQQVLDQALIANBAWsiAwRAIAJBAWohAiAHQQh0IQEgBEEIaiEEDAELCyAERQ0AIAEgCEEMIAZrdEE/cRAoOgABIAFBAmohAAsgAEEAOgAAIAUFIAQLC8oEAQN/IwBB4ABrIgQkACADEB8hBSACEBwhAwJAAkAgBUUNACADDQEgAUECSQ0AIABBJDsAACABQQFrIgMgBRAKIgFNDQAgAEEBaiAFIAFBAWoQBSEAIAMgAWsiA0EESQ0AIAAgAWoiAUGk7PUBNgAAIAQgAigCODYCMCAEQUBrIARBMGoQEyADQQNrIgMgBEFAaxAKIgBNDQAgAUEDaiAEQUBrIABBAWoQBSEBIAMgAGsiA0EESQ0AIAAgAWoiAUGk2vUBNgAAIAQgAigCLDYCICAEQUBrIARBIGoQEyADQQNrIgMgBEFAaxAKIgBNDQAgAUEDaiAEQUBrIABBAWoQBSEBIAMgAGsiA0EESQ0AIAAgAWoiAUGs6PUBNgAAIAQgAigCKDYCECAEQUBrIARBEGoQEyADQQNrIgMgBEFAaxAKIgBNDQAgAUEDaiAEQUBrIABBAWoQBSEBIAMgAGsiA0EESQ0AIAAgAWoiAUGs4PUBNgAAIAQgAigCMDYCACAEQUBrIAQQEyADQQNrIgMgBEFAaxAKIgBNDQAgAUEDaiAEQUBrIABBAWoQBSEBIAMgAGsiA0ECSQ0AIAAgAWoiAEEkOwAAIABBAWoiACADQQFrIgYgAigCECACKAIUECkiAUF/RiIFDQBBYSEDIAZBACABIAUbayIGQQJJDQEgACAAIAFqIAUbIgBBJDsAACAAQQFqIAZBAWsgAigCACACKAIEECkhACAEQeAAaiQAQWFBACAAQX9GGw8LQWEhAwsgBEHgAGokACADC7gBAQF/QQAgAEEEaiAAQdD/A2pBCHZBf3NxQTkgAGtBCHZBf3NxQf8BcSAAQcEAayIBIAFBCHZBf3NxQdoAIABrQQh2QX9zcUH/AXEgAEG5AWogAEGf/wNqQQh2QX9zcUH6ACAAa0EIdkF/c3FB/wFxIABB0P8Ac0EBakEIdkF/c0E/cSAAQdT/AHNBAWpBCHZBf3NBPnFycnJyIgFrQQh2QX9zIABBvv8Dc0EBakEIdnFB/wFxIAFyC64BAQR/An8CfyACLAAAECsiBkH/AUYEQEF/DAELA0AgBCAGaiEEAkAgA0EGaiIGQQhJBEAgBiEDDAELIAEoAgAgBU0EQEEADwsgACAEIANBAmsiA3Y6AAAgAEEBaiEAIAVBAWohBQsgAkEBaiICLAAAECsiBkH/AUcEQCAEQQZ0IQQMAQsLQQAgA0EESw0BGkF/IAN0CyEDQQAgBCADQX9zcQ0AGiABIAU2AgAgAgsLrAMBBX8jAEEQayIDJAAgACgCBCEGIAAoAhQhBwJAIAIQHyIERQRAQWYhAgwBC0FgIQIgAS0AACIFQSRHDQAgAUEBaiABIAVBJEYbIgEgBCAEEAoiBBAQIgUNACAAQRA2AjggASABIARqIgEgBRsiBEHfFEEDEBBFBEAgBEEDaiADQQxqEBUiAUUNASAAIAMoAgw2AjgLIAFB6xRBAxAQDQAgAUEDaiADQQxqEBUiAUUNACAAIAMoAgw2AiwgAUHjFEEDEBANACABQQNqIANBDGoQFSIBRQ0AIAAgAygCDDYCKCABQecUQQMQEA0AIAFBA2ogA0EMahAVIgFFDQAgACADKAIMIgQ2AjAgACAENgI0IAEtAABBJEcNACADIAc2AgwgACgCECADQQxqIAFBAWoQLCIBRQ0AIAAgAygCDDYCFCABLQAAQSRHDQAgAyAGNgIMIAAoAgAgA0EMaiABQQFqECwiAUUNACAAIAMoAgw2AgQgAEEANgJEIABCADcCPCAAQgA3AhggAEIANwIgIAAQHCICDQBBYEEAIAEtAAAbIQILIANBEGokACACCykBAn8DQCAAIAJBA3QiA2ogASADaikAADcDACACQQFqIgJBgAFHDQALCwwAIABBAEGACBALGgtlAQJ/IAAgAhAeIgIEfyACBUFdQQACfyAAKAIAIQRBACECIAAoAgQiAAR/A0AgAyACIARqLQAAIAEgAmotAABzciEDIAJBAWoiAiAARw0ACyADQQFrQQh2QQFxQQFrBUEACwsbCwtdAQJ/IwBB8AFrIgMkAEF/IQQCQCACRSAARSABRXJyIAFBwABLcg0AIAMgARAYQQBIDQAgAyACQcAAEAZBAEgNACADIAAgARASIQQLIANB8AEQBCADQfABaiQAIAQLCQAgACABNwAACxAAIwAgAGtBcHEiACQAIAALMwEBfyAAKAIUIgMgASACIAAoAhAgA2siASABIAJLGyIBEAUaIAAgACgCFCABajYCFCACC9oBAQR/IwBB0ABrIggkAAJAIABFBEBBYCEADAELIAggABAKIgk2AgwgCCAJNgIcIAggCRAJIgo2AhggCCAJEAkiCzYCCEEAIQkCQAJAIApFIAtFcg0AIAggAjYCFCAIIAE2AhAgCEEIaiAAIAcQLSIADQEgCCgCCCEJIAggCCgCDBAJIgA2AgggAEUNACAIIAY2AiwgCCAFNgIoIAggBDYCJCAIIAM2AiAgCEEIaiAJIAcQMCEADAELQWohAAsgCCgCGBAIIAgoAggQCCAJEAgLIAhB0ABqJAAgAAuQAgEDfyMAQdAAayIRJABBfiETAkAgCEEESQ0AIAgQCSISRQRAQWohEwwBCyARQQA2AkwgEUIANwJEIBEgAjYCPCARIAI2AjggESABNgI0IBEgADYCMCARIA82AiwgESAONgIoIBEgDTYCJCAR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IGxvbmcgb3IgdG9vIHNob3J0AE1pc3NpbmcgYXJndW1lbnRzAFRvbyBtYW55IGxhbmVzAFRvbyBmZXcgbGFuZXMAVG9vIG1hbnkgdGhyZWFkcwBOb3QgZW5vdWdoIHRocmVhZHMATWVtb3J5IGFsbG9jYXRpb24gZXJyb3IATWVtb3J5IGNvc3QgaXMgdG9vIHNtYWxsAFRpbWUgY29zdCBpcyB0b28gc21hbGwAYXJnb24yaQBBcmdvbjJpAFRoZSBwYXNzd29yZCBkb2VzIG5vdCBtYXRjaCB0aGUgc3VwcGxpZWQgaGFzaABPdXRwdXQgcG9pbnRlciBtaXNtYXRjaABPdXRwdXQgaXMgdG9vIGxvbmcAU2FsdCBpcyB0b28gbG9uZwBTZWNyZXQgaXMgdG9vIGxvbmcAUGFzc3dvcmQgaXMgdG9vIGxvbmcAQXNzb2NpYXRlZCBkYXRhIGlzIHRvbyBsb25nAFRocmVhZGluZyBmYWlsdXJlAE1lbW9yeSBjb3N0IGlzIHRvbyBsYXJnZQBUaW1lIGNvc3QgaXMgdG9vIGxhcmdlAFVua25vd24gZXJyb3IgY29kZQBhcmdvbjJpZABBcmdvbjJpZABFbmNvZGluZyBmYWlsZWQARGVjb2RpbmcgZmFpbGVkAGFyZ29uMmQAQXJnb24yZABBcmdvbjJfQ29udGV4dCBjb250ZXh0IGlzIE5VTEwAT3V0cHV0IHBvaW50ZXIgaXMgTlVMTABUaGUgYWxsb2NhdGUgbWVtb3J5IGNhbGxiYWNrIGlzIE5VTEwAVGhlIGZyZWUgbWVtb3J5IGNhbGxiYWNrIGlzIE5VTEwAT0sAJHY9ACx0PQAscD0AJG09AFRoZXJlIGlzIG5vIHN1Y2ggdmVyc2lvbiBvZiBBcmdvbjIAU2FsdCBwb2ludGVyIGlzIE5VTEwsIGJ1dCBzYWx0IGxlbmd0aCBpcyBub3QgMABTZWNyZXQgcG9pbnRlciBpcyBOVUxMLCBidXQgc2VjcmV0IGxlbmd0aCBpcyBub3QgMABQYXNzd29yZCBwb2ludGVyIGlzIE5VTEwsIGJ1dCBwYXNzd29yZCBsZW5ndGggaXMgbm90IDAAQXNzb2NpYXRlZCBkYXRhIHBvaW50ZXIgaXMgTlVMTCwgYnV0IGFkIGxlbmd0aCBpcyBub3QgMAAobnVsbCkAAACbCAAAuwcAAEkJAADACQAAsAkAAPAHAAAfCAAAMAgAAMkIAABvCgAA4AkAABYKAAA7CgAAQwgAACsLAADBCgAAkgoAAPQKAAACCAAAEQgAAFsJAABbCAAAdAkAAHQIAAAFCQAAdAcAAC0JAACeBwAA9AgAAGIHAAAYCQAAiAcAAOEIAABOBwAA/wkAAFwKAAABAEGkGAsBAgBByxgLBf//////AEGQGQtBEQAKABEREQAAAAAFAAAAAAAACQAAAAALAAAAAAAAAAARAA8KERERAwoHAAEACQsLAAAJBgsAAAsABhEAAAAREREAQeEZCyELAAAAAAAAAAARAAoKERERAAoAAAIACQsAAAAJAAsAAAsAQZsaCwEMAEGnGgsVDAAAAAAMAAAAAAkMAAAAAAAMAAAMAEHVGgsBDgBB4RoLFQ0AAAAEDQAAAAAJDgAAAAAADgAADgBBjxsLARAAQZsbCx4PAAAAAA8AAAAACRAAAAAAABAAABAAABIAAAASEhIAQdIbCw4SAAAAEhISAAAAAAAACQBBgxwLAQsAQY8cCxUKAAAAAAoAAAAACQsAAAAAAAsAAAsAQb0cCwEMAEHJHAsnDAAAAAAMAAAAAAkMAAAAAAAMAAAMAAAwMTIzNDU2Nzg5QUJDREVGAEHwHAsBAQBBoB4LAogPAEHYHgsDkBFQ";
  }
});

// node_modules/argon2-browser/lib/argon2.js
var require_argon23 = __commonJS({
  "node_modules/argon2-browser/lib/argon2.js"(exports, module) {
    (function(root, factory) {
      if (typeof define === "function" && define.amd) {
        define([], factory);
      } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
      } else {
        root.argon2 = factory();
      }
    })(typeof self !== "undefined" ? self : exports, function() {
      const global = typeof self !== "undefined" ? self : this;
      const ArgonType = {
        Argon2d: 0,
        Argon2i: 1,
        Argon2id: 2
      };
      function loadModule(mem) {
        if (loadModule._promise) {
          return loadModule._promise;
        }
        if (loadModule._module) {
          return Promise.resolve(loadModule._module);
        }
        let promise;
        if (global.process && global.process.versions && global.process.versions.node) {
          promise = loadWasmModule().then(
            (Module3) => new Promise((resolve) => {
              Module3.postRun = () => resolve(Module3);
            })
          );
        } else {
          promise = loadWasmBinary().then((wasmBinary) => {
            const wasmMemory2 = mem ? createWasmMemory(mem) : void 0;
            return initWasm(wasmBinary, wasmMemory2);
          });
        }
        loadModule._promise = promise;
        return promise.then((Module3) => {
          loadModule._module = Module3;
          delete loadModule._promise;
          return Module3;
        });
      }
      function initWasm(wasmBinary, wasmMemory2) {
        return new Promise((resolve) => {
          global.Module = {
            wasmBinary,
            wasmMemory: wasmMemory2,
            postRun() {
              resolve(Module);
            }
          };
          return loadWasmModule();
        });
      }
      function loadWasmModule() {
        if (global.loadArgon2WasmModule) {
          return global.loadArgon2WasmModule();
        }
        if (typeof __require === "function") {
          return Promise.resolve(require_argon2());
        }
        return Promise.resolve().then(() => __toESM(require_argon2()));
      }
      function loadWasmBinary() {
        if (global.loadArgon2WasmBinary) {
          return global.loadArgon2WasmBinary();
        }
        if (typeof __require === "function") {
          return Promise.resolve(require_argon22()).then(
            (wasmModule) => {
              return decodeWasmBinary(wasmModule);
            }
          );
        }
        const wasmPath = global.argon2WasmPath || "node_modules/argon2-browser/dist/argon2.wasm";
        return fetch(wasmPath).then((response) => response.arrayBuffer()).then((ab) => new Uint8Array(ab));
      }
      function decodeWasmBinary(base64) {
        const text = atob(base64);
        const binary = new Uint8Array(new ArrayBuffer(text.length));
        for (let i3 = 0; i3 < text.length; i3++) {
          binary[i3] = text.charCodeAt(i3);
        }
        return binary;
      }
      function createWasmMemory(mem) {
        const KB = 1024;
        const MB = 1024 * KB;
        const GB = 1024 * MB;
        const WASM_PAGE_SIZE = 64 * KB;
        const totalMemory = (2 * GB - 64 * KB) / WASM_PAGE_SIZE;
        const initialMemory = Math.min(
          Math.max(Math.ceil(mem * KB / WASM_PAGE_SIZE), 256) + 256,
          totalMemory
        );
        return new WebAssembly.Memory({
          initial: initialMemory,
          maximum: totalMemory
        });
      }
      function allocateArray(Module3, arr) {
        return Module3.allocate(arr, "i8", Module3.ALLOC_NORMAL);
      }
      function allocateArrayStr(Module3, arr) {
        const nullTerminatedArray = new Uint8Array([...arr, 0]);
        return allocateArray(Module3, nullTerminatedArray);
      }
      function encodeUtf8(str) {
        if (typeof str !== "string") {
          return str;
        }
        if (typeof TextEncoder === "function") {
          return new TextEncoder().encode(str);
        } else if (typeof Buffer === "function") {
          return Buffer.from(str);
        } else {
          throw new Error("Don't know how to encode UTF8");
        }
      }
      function argon2Hash(params) {
        const mCost = params.mem || 1024;
        return loadModule(mCost).then((Module3) => {
          const tCost = params.time || 1;
          const parallelism = params.parallelism || 1;
          const pwdEncoded = encodeUtf8(params.pass);
          const pwd = allocateArrayStr(Module3, pwdEncoded);
          const pwdlen = pwdEncoded.length;
          const saltEncoded = encodeUtf8(params.salt);
          const salt = allocateArrayStr(Module3, saltEncoded);
          const saltlen = saltEncoded.length;
          const argon2Type = params.type || ArgonType.Argon2d;
          const hash = Module3.allocate(
            new Array(params.hashLen || 24),
            "i8",
            Module3.ALLOC_NORMAL
          );
          const secret = params.secret ? allocateArray(Module3, params.secret) : 0;
          const secretlen = params.secret ? params.secret.byteLength : 0;
          const ad = params.ad ? allocateArray(Module3, params.ad) : 0;
          const adlen = params.ad ? params.ad.byteLength : 0;
          const hashlen = params.hashLen || 24;
          const encodedlen = Module3._argon2_encodedlen(
            tCost,
            mCost,
            parallelism,
            saltlen,
            hashlen,
            argon2Type
          );
          const encoded = Module3.allocate(
            new Array(encodedlen + 1),
            "i8",
            Module3.ALLOC_NORMAL
          );
          const version = 19;
          let err2;
          let res;
          try {
            res = Module3._argon2_hash_ext(
              tCost,
              mCost,
              parallelism,
              pwd,
              pwdlen,
              salt,
              saltlen,
              hash,
              hashlen,
              encoded,
              encodedlen,
              argon2Type,
              secret,
              secretlen,
              ad,
              adlen,
              version
            );
          } catch (e3) {
            err2 = e3;
          }
          let result;
          if (res === 0 && !err2) {
            let hashStr = "";
            const hashArr = new Uint8Array(hashlen);
            for (let i3 = 0; i3 < hashlen; i3++) {
              const byte = Module3.HEAP8[hash + i3];
              hashArr[i3] = byte;
              hashStr += ("0" + (255 & byte).toString(16)).slice(-2);
            }
            const encodedStr = Module3.UTF8ToString(encoded);
            result = {
              hash: hashArr,
              hashHex: hashStr,
              encoded: encodedStr
            };
          } else {
            try {
              if (!err2) {
                err2 = Module3.UTF8ToString(
                  Module3._argon2_error_message(res)
                );
              }
            } catch (e3) {
            }
            result = { message: err2, code: res };
          }
          try {
            Module3._free(pwd);
            Module3._free(salt);
            Module3._free(hash);
            Module3._free(encoded);
            if (ad) {
              Module3._free(ad);
            }
            if (secret) {
              Module3._free(secret);
            }
          } catch (e3) {
          }
          if (err2) {
            throw result;
          } else {
            return result;
          }
        });
      }
      function argon2Verify(params) {
        return loadModule().then((Module3) => {
          const pwdEncoded = encodeUtf8(params.pass);
          const pwd = allocateArrayStr(Module3, pwdEncoded);
          const pwdlen = pwdEncoded.length;
          const secret = params.secret ? allocateArray(Module3, params.secret) : 0;
          const secretlen = params.secret ? params.secret.byteLength : 0;
          const ad = params.ad ? allocateArray(Module3, params.ad) : 0;
          const adlen = params.ad ? params.ad.byteLength : 0;
          const encEncoded = encodeUtf8(params.encoded);
          const enc = allocateArrayStr(Module3, encEncoded);
          let argon2Type = params.type;
          if (argon2Type === void 0) {
            let typeStr = params.encoded.split("$")[1];
            if (typeStr) {
              typeStr = typeStr.replace("a", "A");
              argon2Type = ArgonType[typeStr] || ArgonType.Argon2d;
            }
          }
          let err2;
          let res;
          try {
            res = Module3._argon2_verify_ext(
              enc,
              pwd,
              pwdlen,
              secret,
              secretlen,
              ad,
              adlen,
              argon2Type
            );
          } catch (e3) {
            err2 = e3;
          }
          let result;
          if (res || err2) {
            try {
              if (!err2) {
                err2 = Module3.UTF8ToString(
                  Module3._argon2_error_message(res)
                );
              }
            } catch (e3) {
            }
            result = { message: err2, code: res };
          }
          try {
            Module3._free(pwd);
            Module3._free(enc);
          } catch (e3) {
          }
          if (err2) {
            throw result;
          } else {
            return result;
          }
        });
      }
      function unloadRuntime() {
        if (loadModule._module) {
          loadModule._module.unloadRuntime();
          delete loadModule._promise;
          delete loadModule._module;
        }
      }
      return {
        ArgonType,
        hash: argon2Hash,
        verify: argon2Verify,
        unloadRuntime
      };
    });
  }
});

// node_modules/preact/dist/preact.module.js
var n;
var l;
var u;
var t;
var i;
var r;
var o;
var e;
var f;
var c;
var a;
var s;
var h;
var p;
var v;
var y;
var d = {};
var w = [];
var _ = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
var g = Array.isArray;
function m(n3, l5) {
  for (var u3 in l5) n3[u3] = l5[u3];
  return n3;
}
function b(n3) {
  n3 && n3.parentNode && n3.parentNode.removeChild(n3);
}
function k(l5, u3, t4) {
  var i3, r3, o3, e3 = {};
  for (o3 in u3) "key" == o3 ? i3 = u3[o3] : "ref" == o3 ? r3 = u3[o3] : e3[o3] = u3[o3];
  if (arguments.length > 2 && (e3.children = arguments.length > 3 ? n.call(arguments, 2) : t4), "function" == typeof l5 && null != l5.defaultProps) for (o3 in l5.defaultProps) void 0 === e3[o3] && (e3[o3] = l5.defaultProps[o3]);
  return x(l5, e3, i3, r3, null);
}
function x(n3, t4, i3, r3, o3) {
  var e3 = { type: n3, props: t4, key: i3, ref: r3, __k: null, __: null, __b: 0, __e: null, __c: null, constructor: void 0, __v: null == o3 ? ++u : o3, __i: -1, __u: 0 };
  return null == o3 && null != l.vnode && l.vnode(e3), e3;
}
function S(n3) {
  return n3.children;
}
function C(n3, l5) {
  this.props = n3, this.context = l5;
}
function $(n3, l5) {
  if (null == l5) return n3.__ ? $(n3.__, n3.__i + 1) : null;
  for (var u3; l5 < n3.__k.length; l5++) if (null != (u3 = n3.__k[l5]) && null != u3.__e) return u3.__e;
  return "function" == typeof n3.type ? $(n3) : null;
}
function I(n3) {
  if (n3.__P && n3.__d) {
    var u3 = n3.__v, t4 = u3.__e, i3 = [], r3 = [], o3 = m({}, u3);
    o3.__v = u3.__v + 1, l.vnode && l.vnode(o3), q(n3.__P, o3, u3, n3.__n, n3.__P.namespaceURI, 32 & u3.__u ? [t4] : null, i3, null == t4 ? $(u3) : t4, !!(32 & u3.__u), r3), o3.__v = u3.__v, o3.__.__k[o3.__i] = o3, D(i3, o3, r3), u3.__e = u3.__ = null, o3.__e != t4 && P(o3);
  }
}
function P(n3) {
  if (null != (n3 = n3.__) && null != n3.__c) return n3.__e = n3.__c.base = null, n3.__k.some(function(l5) {
    if (null != l5 && null != l5.__e) return n3.__e = n3.__c.base = l5.__e;
  }), P(n3);
}
function A(n3) {
  (!n3.__d && (n3.__d = true) && i.push(n3) && !H.__r++ || r != l.debounceRendering) && ((r = l.debounceRendering) || o)(H);
}
function H() {
  try {
    for (var n3, l5 = 1; i.length; ) i.length > l5 && i.sort(e), n3 = i.shift(), l5 = i.length, I(n3);
  } finally {
    i.length = H.__r = 0;
  }
}
function L(n3, l5, u3, t4, i3, r3, o3, e3, f3, c3, a3) {
  var s3, h3, p3, v4, y4, _3, g3, m4 = t4 && t4.__k || w, b3 = l5.length;
  for (f3 = T(u3, l5, m4, f3, b3), s3 = 0; s3 < b3; s3++) null != (p3 = u3.__k[s3]) && (h3 = -1 != p3.__i && m4[p3.__i] || d, p3.__i = s3, _3 = q(n3, p3, h3, i3, r3, o3, e3, f3, c3, a3), v4 = p3.__e, p3.ref && h3.ref != p3.ref && (h3.ref && J(h3.ref, null, p3), a3.push(p3.ref, p3.__c || v4, p3)), null == y4 && null != v4 && (y4 = v4), (g3 = !!(4 & p3.__u)) || h3.__k === p3.__k ? (f3 = j(p3, f3, n3, g3), g3 && h3.__e && (h3.__e = null)) : "function" == typeof p3.type && void 0 !== _3 ? f3 = _3 : v4 && (f3 = v4.nextSibling), p3.__u &= -7);
  return u3.__e = y4, f3;
}
function T(n3, l5, u3, t4, i3) {
  var r3, o3, e3, f3, c3, a3 = u3.length, s3 = a3, h3 = 0;
  for (n3.__k = new Array(i3), r3 = 0; r3 < i3; r3++) null != (o3 = l5[r3]) && "boolean" != typeof o3 && "function" != typeof o3 ? ("string" == typeof o3 || "number" == typeof o3 || "bigint" == typeof o3 || o3.constructor == String ? o3 = n3.__k[r3] = x(null, o3, null, null, null) : g(o3) ? o3 = n3.__k[r3] = x(S, { children: o3 }, null, null, null) : void 0 === o3.constructor && o3.__b > 0 ? o3 = n3.__k[r3] = x(o3.type, o3.props, o3.key, o3.ref ? o3.ref : null, o3.__v) : n3.__k[r3] = o3, f3 = r3 + h3, o3.__ = n3, o3.__b = n3.__b + 1, e3 = null, -1 != (c3 = o3.__i = O(o3, u3, f3, s3)) && (s3--, (e3 = u3[c3]) && (e3.__u |= 2)), null == e3 || null == e3.__v ? (-1 == c3 && (i3 > a3 ? h3-- : i3 < a3 && h3++), "function" != typeof o3.type && (o3.__u |= 4)) : c3 != f3 && (c3 == f3 - 1 ? h3-- : c3 == f3 + 1 ? h3++ : (c3 > f3 ? h3-- : h3++, o3.__u |= 4))) : n3.__k[r3] = null;
  if (s3) for (r3 = 0; r3 < a3; r3++) null != (e3 = u3[r3]) && 0 == (2 & e3.__u) && (e3.__e == t4 && (t4 = $(e3)), K(e3, e3));
  return t4;
}
function j(n3, l5, u3, t4) {
  var i3, r3;
  if ("function" == typeof n3.type) {
    for (i3 = n3.__k, r3 = 0; i3 && r3 < i3.length; r3++) i3[r3] && (i3[r3].__ = n3, l5 = j(i3[r3], l5, u3, t4));
    return l5;
  }
  n3.__e != l5 && (t4 && (l5 && n3.type && !l5.parentNode && (l5 = $(n3)), u3.insertBefore(n3.__e, l5 || null)), l5 = n3.__e);
  do {
    l5 = l5 && l5.nextSibling;
  } while (null != l5 && 8 == l5.nodeType);
  return l5;
}
function O(n3, l5, u3, t4) {
  var i3, r3, o3, e3 = n3.key, f3 = n3.type, c3 = l5[u3], a3 = null != c3 && 0 == (2 & c3.__u);
  if (null === c3 && null == e3 || a3 && e3 == c3.key && f3 == c3.type) return u3;
  if (t4 > (a3 ? 1 : 0)) {
    for (i3 = u3 - 1, r3 = u3 + 1; i3 >= 0 || r3 < l5.length; ) if (null != (c3 = l5[o3 = i3 >= 0 ? i3-- : r3++]) && 0 == (2 & c3.__u) && e3 == c3.key && f3 == c3.type) return o3;
  }
  return -1;
}
function z(n3, l5, u3) {
  "-" == l5[0] ? n3.setProperty(l5, null == u3 ? "" : u3) : n3[l5] = null == u3 ? "" : "number" != typeof u3 || _.test(l5) ? u3 : u3 + "px";
}
function N(n3, l5, u3, t4, i3) {
  var r3, o3;
  n: if ("style" == l5) if ("string" == typeof u3) n3.style.cssText = u3;
  else {
    if ("string" == typeof t4 && (n3.style.cssText = t4 = ""), t4) for (l5 in t4) u3 && l5 in u3 || z(n3.style, l5, "");
    if (u3) for (l5 in u3) t4 && u3[l5] == t4[l5] || z(n3.style, l5, u3[l5]);
  }
  else if ("o" == l5[0] && "n" == l5[1]) r3 = l5 != (l5 = l5.replace(s, "$1")), o3 = l5.toLowerCase(), l5 = o3 in n3 || "onFocusOut" == l5 || "onFocusIn" == l5 ? o3.slice(2) : l5.slice(2), n3.l || (n3.l = {}), n3.l[l5 + r3] = u3, u3 ? t4 ? u3[a] = t4[a] : (u3[a] = h, n3.addEventListener(l5, r3 ? v : p, r3)) : n3.removeEventListener(l5, r3 ? v : p, r3);
  else {
    if ("http://www.w3.org/2000/svg" == i3) l5 = l5.replace(/xlink(H|:h)/, "h").replace(/sName$/, "s");
    else if ("width" != l5 && "height" != l5 && "href" != l5 && "list" != l5 && "form" != l5 && "tabIndex" != l5 && "download" != l5 && "rowSpan" != l5 && "colSpan" != l5 && "role" != l5 && "popover" != l5 && l5 in n3) try {
      n3[l5] = null == u3 ? "" : u3;
      break n;
    } catch (n4) {
    }
    "function" == typeof u3 || (null == u3 || false === u3 && "-" != l5[4] ? n3.removeAttribute(l5) : n3.setAttribute(l5, "popover" == l5 && 1 == u3 ? "" : u3));
  }
}
function V(n3) {
  return function(u3) {
    if (this.l) {
      var t4 = this.l[u3.type + n3];
      if (null == u3[c]) u3[c] = h++;
      else if (u3[c] < t4[a]) return;
      return t4(l.event ? l.event(u3) : u3);
    }
  };
}
function q(n3, u3, t4, i3, r3, o3, e3, f3, c3, a3) {
  var s3, h3, p3, v4, y4, d4, _3, k3, x3, M2, $3, I3, P3, A4, H3, T4 = u3.type;
  if (void 0 !== u3.constructor) return null;
  128 & t4.__u && (c3 = !!(32 & t4.__u), o3 = [f3 = u3.__e = t4.__e]), (s3 = l.__b) && s3(u3);
  n: if ("function" == typeof T4) try {
    if (k3 = u3.props, x3 = T4.prototype && T4.prototype.render, M2 = (s3 = T4.contextType) && i3[s3.__c], $3 = s3 ? M2 ? M2.props.value : s3.__ : i3, t4.__c ? _3 = (h3 = u3.__c = t4.__c).__ = h3.__E : (x3 ? u3.__c = h3 = new T4(k3, $3) : (u3.__c = h3 = new C(k3, $3), h3.constructor = T4, h3.render = Q), M2 && M2.sub(h3), h3.state || (h3.state = {}), h3.__n = i3, p3 = h3.__d = true, h3.__h = [], h3._sb = []), x3 && null == h3.__s && (h3.__s = h3.state), x3 && null != T4.getDerivedStateFromProps && (h3.__s == h3.state && (h3.__s = m({}, h3.__s)), m(h3.__s, T4.getDerivedStateFromProps(k3, h3.__s))), v4 = h3.props, y4 = h3.state, h3.__v = u3, p3) x3 && null == T4.getDerivedStateFromProps && null != h3.componentWillMount && h3.componentWillMount(), x3 && null != h3.componentDidMount && h3.__h.push(h3.componentDidMount);
    else {
      if (x3 && null == T4.getDerivedStateFromProps && k3 !== v4 && null != h3.componentWillReceiveProps && h3.componentWillReceiveProps(k3, $3), u3.__v == t4.__v || !h3.__e && null != h3.shouldComponentUpdate && false === h3.shouldComponentUpdate(k3, h3.__s, $3)) {
        u3.__v != t4.__v && (h3.props = k3, h3.state = h3.__s, h3.__d = false), u3.__e = t4.__e, u3.__k = t4.__k, u3.__k.some(function(n4) {
          n4 && (n4.__ = u3);
        }), w.push.apply(h3.__h, h3._sb), h3._sb = [], h3.__h.length && e3.push(h3);
        break n;
      }
      null != h3.componentWillUpdate && h3.componentWillUpdate(k3, h3.__s, $3), x3 && null != h3.componentDidUpdate && h3.__h.push(function() {
        h3.componentDidUpdate(v4, y4, d4);
      });
    }
    if (h3.context = $3, h3.props = k3, h3.__P = n3, h3.__e = false, I3 = l.__r, P3 = 0, x3) h3.state = h3.__s, h3.__d = false, I3 && I3(u3), s3 = h3.render(h3.props, h3.state, h3.context), w.push.apply(h3.__h, h3._sb), h3._sb = [];
    else do {
      h3.__d = false, I3 && I3(u3), s3 = h3.render(h3.props, h3.state, h3.context), h3.state = h3.__s;
    } while (h3.__d && ++P3 < 25);
    h3.state = h3.__s, null != h3.getChildContext && (i3 = m(m({}, i3), h3.getChildContext())), x3 && !p3 && null != h3.getSnapshotBeforeUpdate && (d4 = h3.getSnapshotBeforeUpdate(v4, y4)), A4 = null != s3 && s3.type === S && null == s3.key ? E(s3.props.children) : s3, f3 = L(n3, g(A4) ? A4 : [A4], u3, t4, i3, r3, o3, e3, f3, c3, a3), h3.base = u3.__e, u3.__u &= -161, h3.__h.length && e3.push(h3), _3 && (h3.__E = h3.__ = null);
  } catch (n4) {
    if (u3.__v = null, c3 || null != o3) if (n4.then) {
      for (u3.__u |= c3 ? 160 : 128; f3 && 8 == f3.nodeType && f3.nextSibling; ) f3 = f3.nextSibling;
      o3[o3.indexOf(f3)] = null, u3.__e = f3;
    } else {
      for (H3 = o3.length; H3--; ) b(o3[H3]);
      B(u3);
    }
    else u3.__e = t4.__e, u3.__k = t4.__k, n4.then || B(u3);
    l.__e(n4, u3, t4);
  }
  else null == o3 && u3.__v == t4.__v ? (u3.__k = t4.__k, u3.__e = t4.__e) : f3 = u3.__e = G(t4.__e, u3, t4, i3, r3, o3, e3, c3, a3);
  return (s3 = l.diffed) && s3(u3), 128 & u3.__u ? void 0 : f3;
}
function B(n3) {
  n3 && (n3.__c && (n3.__c.__e = true), n3.__k && n3.__k.some(B));
}
function D(n3, u3, t4) {
  for (var i3 = 0; i3 < t4.length; i3++) J(t4[i3], t4[++i3], t4[++i3]);
  l.__c && l.__c(u3, n3), n3.some(function(u4) {
    try {
      n3 = u4.__h, u4.__h = [], n3.some(function(n4) {
        n4.call(u4);
      });
    } catch (n4) {
      l.__e(n4, u4.__v);
    }
  });
}
function E(n3) {
  return "object" != typeof n3 || null == n3 || n3.__b > 0 ? n3 : g(n3) ? n3.map(E) : void 0 !== n3.constructor ? null : m({}, n3);
}
function G(u3, t4, i3, r3, o3, e3, f3, c3, a3) {
  var s3, h3, p3, v4, y4, w4, _3, m4 = i3.props || d, k3 = t4.props, x3 = t4.type;
  if ("svg" == x3 ? o3 = "http://www.w3.org/2000/svg" : "math" == x3 ? o3 = "http://www.w3.org/1998/Math/MathML" : o3 || (o3 = "http://www.w3.org/1999/xhtml"), null != e3) {
    for (s3 = 0; s3 < e3.length; s3++) if ((y4 = e3[s3]) && "setAttribute" in y4 == !!x3 && (x3 ? y4.localName == x3 : 3 == y4.nodeType)) {
      u3 = y4, e3[s3] = null;
      break;
    }
  }
  if (null == u3) {
    if (null == x3) return document.createTextNode(k3);
    u3 = document.createElementNS(o3, x3, k3.is && k3), c3 && (l.__m && l.__m(t4, e3), c3 = false), e3 = null;
  }
  if (null == x3) m4 === k3 || c3 && u3.data == k3 || (u3.data = k3);
  else {
    if (e3 = "textarea" == x3 && null != k3.defaultValue ? null : e3 && n.call(u3.childNodes), !c3 && null != e3) for (m4 = {}, s3 = 0; s3 < u3.attributes.length; s3++) m4[(y4 = u3.attributes[s3]).name] = y4.value;
    for (s3 in m4) y4 = m4[s3], "dangerouslySetInnerHTML" == s3 ? p3 = y4 : "children" == s3 || s3 in k3 || "value" == s3 && "defaultValue" in k3 || "checked" == s3 && "defaultChecked" in k3 || N(u3, s3, null, y4, o3);
    for (s3 in k3) y4 = k3[s3], "children" == s3 ? v4 = y4 : "dangerouslySetInnerHTML" == s3 ? h3 = y4 : "value" == s3 ? w4 = y4 : "checked" == s3 ? _3 = y4 : c3 && "function" != typeof y4 || m4[s3] === y4 || N(u3, s3, y4, m4[s3], o3);
    if (h3) c3 || p3 && (h3.__html == p3.__html || h3.__html == u3.innerHTML) || (u3.innerHTML = h3.__html), t4.__k = [];
    else if (p3 && (u3.innerHTML = ""), L("template" == t4.type ? u3.content : u3, g(v4) ? v4 : [v4], t4, i3, r3, "foreignObject" == x3 ? "http://www.w3.org/1999/xhtml" : o3, e3, f3, e3 ? e3[0] : i3.__k && $(i3, 0), c3, a3), null != e3) for (s3 = e3.length; s3--; ) b(e3[s3]);
    c3 && "textarea" != x3 || (s3 = "value", "progress" == x3 && null == w4 ? u3.removeAttribute("value") : null != w4 && (w4 !== u3[s3] || "progress" == x3 && !w4 || "option" == x3 && w4 != m4[s3]) && N(u3, s3, w4, m4[s3], o3), s3 = "checked", null != _3 && _3 != u3[s3] && N(u3, s3, _3, m4[s3], o3));
  }
  return u3;
}
function J(n3, u3, t4) {
  try {
    if ("function" == typeof n3) {
      var i3 = "function" == typeof n3.__u;
      i3 && n3.__u(), i3 && null == u3 || (n3.__u = n3(u3));
    } else n3.current = u3;
  } catch (n4) {
    l.__e(n4, t4);
  }
}
function K(n3, u3, t4) {
  var i3, r3;
  if (l.unmount && l.unmount(n3), (i3 = n3.ref) && (i3.current && i3.current != n3.__e || J(i3, null, u3)), null != (i3 = n3.__c)) {
    if (i3.componentWillUnmount) try {
      i3.componentWillUnmount();
    } catch (n4) {
      l.__e(n4, u3);
    }
    i3.base = i3.__P = null;
  }
  if (i3 = n3.__k) for (r3 = 0; r3 < i3.length; r3++) i3[r3] && K(i3[r3], u3, t4 || "function" != typeof n3.type);
  t4 || b(n3.__e), n3.__c = n3.__ = n3.__e = void 0;
}
function Q(n3, l5, u3) {
  return this.constructor(n3, u3);
}
function R(u3, t4, i3) {
  var r3, o3, e3, f3;
  t4 == document && (t4 = document.documentElement), l.__ && l.__(u3, t4), o3 = (r3 = "function" == typeof i3) ? null : i3 && i3.__k || t4.__k, e3 = [], f3 = [], q(t4, u3 = (!r3 && i3 || t4).__k = k(S, null, [u3]), o3 || d, d, t4.namespaceURI, !r3 && i3 ? [i3] : o3 ? null : t4.firstChild ? n.call(t4.childNodes) : null, e3, !r3 && i3 ? i3 : o3 ? o3.__e : t4.firstChild, r3, f3), D(e3, u3, f3);
}
n = w.slice, l = { __e: function(n3, l5, u3, t4) {
  for (var i3, r3, o3; l5 = l5.__; ) if ((i3 = l5.__c) && !i3.__) try {
    if ((r3 = i3.constructor) && null != r3.getDerivedStateFromError && (i3.setState(r3.getDerivedStateFromError(n3)), o3 = i3.__d), null != i3.componentDidCatch && (i3.componentDidCatch(n3, t4 || {}), o3 = i3.__d), o3) return i3.__E = i3;
  } catch (l6) {
    n3 = l6;
  }
  throw n3;
} }, u = 0, t = function(n3) {
  return null != n3 && void 0 === n3.constructor;
}, C.prototype.setState = function(n3, l5) {
  var u3;
  u3 = null != this.__s && this.__s != this.state ? this.__s : this.__s = m({}, this.state), "function" == typeof n3 && (n3 = n3(m({}, u3), this.props)), n3 && m(u3, n3), null != n3 && this.__v && (l5 && this._sb.push(l5), A(this));
}, C.prototype.forceUpdate = function(n3) {
  this.__v && (this.__e = true, n3 && this.__h.push(n3), A(this));
}, C.prototype.render = S, i = [], o = "function" == typeof Promise ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout, e = function(n3, l5) {
  return n3.__v.__b - l5.__v.__b;
}, H.__r = 0, f = Math.random().toString(8), c = "__d" + f, a = "__a" + f, s = /(PointerCapture)$|Capture$/i, h = 0, p = V(false), v = V(true), y = 0;

// node_modules/preact/hooks/dist/hooks.module.js
var t2;
var r2;
var u2;
var i2;
var o2 = 0;
var f2 = [];
var c2 = l;
var e2 = c2.__b;
var a2 = c2.__r;
var v2 = c2.diffed;
var l2 = c2.__c;
var m2 = c2.unmount;
var s2 = c2.__;
function p2(n3, t4) {
  c2.__h && c2.__h(r2, n3, o2 || t4), o2 = 0;
  var u3 = r2.__H || (r2.__H = { __: [], __h: [] });
  return n3 >= u3.__.length && u3.__.push({}), u3.__[n3];
}
function d2(n3) {
  return o2 = 1, h2(D2, n3);
}
function h2(n3, u3, i3) {
  var o3 = p2(t2++, 2);
  if (o3.t = n3, !o3.__c && (o3.__ = [i3 ? i3(u3) : D2(void 0, u3), function(n4) {
    var t4 = o3.__N ? o3.__N[0] : o3.__[0], r3 = o3.t(t4, n4);
    t4 !== r3 && (o3.__N = [r3, o3.__[1]], o3.__c.setState({}));
  }], o3.__c = r2, !r2.__f)) {
    var f3 = function(n4, t4, r3) {
      if (!o3.__c.__H) return true;
      var u4 = o3.__c.__H.__.filter(function(n5) {
        return n5.__c;
      });
      if (u4.every(function(n5) {
        return !n5.__N;
      })) return !c3 || c3.call(this, n4, t4, r3);
      var i4 = o3.__c.props !== n4;
      return u4.some(function(n5) {
        if (n5.__N) {
          var t5 = n5.__[0];
          n5.__ = n5.__N, n5.__N = void 0, t5 !== n5.__[0] && (i4 = true);
        }
      }), c3 && c3.call(this, n4, t4, r3) || i4;
    };
    r2.__f = true;
    var c3 = r2.shouldComponentUpdate, e3 = r2.componentWillUpdate;
    r2.componentWillUpdate = function(n4, t4, r3) {
      if (this.__e) {
        var u4 = c3;
        c3 = void 0, f3(n4, t4, r3), c3 = u4;
      }
      e3 && e3.call(this, n4, t4, r3);
    }, r2.shouldComponentUpdate = f3;
  }
  return o3.__N || o3.__;
}
function y2(n3, u3) {
  var i3 = p2(t2++, 3);
  !c2.__s && C2(i3.__H, u3) && (i3.__ = n3, i3.u = u3, r2.__H.__h.push(i3));
}
function A2(n3) {
  return o2 = 5, T2(function() {
    return { current: n3 };
  }, []);
}
function T2(n3, r3) {
  var u3 = p2(t2++, 7);
  return C2(u3.__H, r3) && (u3.__ = n3(), u3.__H = r3, u3.__h = n3), u3.__;
}
function q2(n3, t4) {
  return o2 = 8, T2(function() {
    return n3;
  }, t4);
}
function j2() {
  for (var n3; n3 = f2.shift(); ) {
    var t4 = n3.__H;
    if (n3.__P && t4) try {
      t4.__h.some(z2), t4.__h.some(B2), t4.__h = [];
    } catch (r3) {
      t4.__h = [], c2.__e(r3, n3.__v);
    }
  }
}
c2.__b = function(n3) {
  r2 = null, e2 && e2(n3);
}, c2.__ = function(n3, t4) {
  n3 && t4.__k && t4.__k.__m && (n3.__m = t4.__k.__m), s2 && s2(n3, t4);
}, c2.__r = function(n3) {
  a2 && a2(n3), t2 = 0;
  var i3 = (r2 = n3.__c).__H;
  i3 && (u2 === r2 ? (i3.__h = [], r2.__h = [], i3.__.some(function(n4) {
    n4.__N && (n4.__ = n4.__N), n4.u = n4.__N = void 0;
  })) : (i3.__h.some(z2), i3.__h.some(B2), i3.__h = [], t2 = 0)), u2 = r2;
}, c2.diffed = function(n3) {
  v2 && v2(n3);
  var t4 = n3.__c;
  t4 && t4.__H && (t4.__H.__h.length && (1 !== f2.push(t4) && i2 === c2.requestAnimationFrame || ((i2 = c2.requestAnimationFrame) || w2)(j2)), t4.__H.__.some(function(n4) {
    n4.u && (n4.__H = n4.u), n4.u = void 0;
  })), u2 = r2 = null;
}, c2.__c = function(n3, t4) {
  t4.some(function(n4) {
    try {
      n4.__h.some(z2), n4.__h = n4.__h.filter(function(n5) {
        return !n5.__ || B2(n5);
      });
    } catch (r3) {
      t4.some(function(n5) {
        n5.__h && (n5.__h = []);
      }), t4 = [], c2.__e(r3, n4.__v);
    }
  }), l2 && l2(n3, t4);
}, c2.unmount = function(n3) {
  m2 && m2(n3);
  var t4, r3 = n3.__c;
  r3 && r3.__H && (r3.__H.__.some(function(n4) {
    try {
      z2(n4);
    } catch (n5) {
      t4 = n5;
    }
  }), r3.__H = void 0, t4 && c2.__e(t4, r3.__v));
};
var k2 = "function" == typeof requestAnimationFrame;
function w2(n3) {
  var t4, r3 = function() {
    clearTimeout(u3), k2 && cancelAnimationFrame(t4), setTimeout(n3);
  }, u3 = setTimeout(r3, 35);
  k2 && (t4 = requestAnimationFrame(r3));
}
function z2(n3) {
  var t4 = r2, u3 = n3.__c;
  "function" == typeof u3 && (n3.__c = void 0, u3()), r2 = t4;
}
function B2(n3) {
  var t4 = r2;
  n3.__c = n3.__(), r2 = t4;
}
function C2(n3, t4) {
  return !n3 || n3.length !== t4.length || t4.some(function(t5, r3) {
    return t5 !== n3[r3];
  });
}
function D2(n3, t4) {
  return "function" == typeof t4 ? t4(n3) : t4;
}

// node_modules/htm/dist/htm.module.js
var n2 = function(t4, s3, r3, e3) {
  var u3;
  s3[0] = 0;
  for (var h3 = 1; h3 < s3.length; h3++) {
    var p3 = s3[h3++], a3 = s3[h3] ? (s3[0] |= p3 ? 1 : 2, r3[s3[h3++]]) : s3[++h3];
    3 === p3 ? e3[0] = a3 : 4 === p3 ? e3[1] = Object.assign(e3[1] || {}, a3) : 5 === p3 ? (e3[1] = e3[1] || {})[s3[++h3]] = a3 : 6 === p3 ? e3[1][s3[++h3]] += a3 + "" : p3 ? (u3 = t4.apply(a3, n2(t4, a3, r3, ["", null])), e3.push(u3), a3[0] ? s3[0] |= 2 : (s3[h3 - 2] = 0, s3[h3] = u3)) : e3.push(a3);
  }
  return e3;
};
var t3 = /* @__PURE__ */ new Map();
function htm_module_default(s3) {
  var r3 = t3.get(this);
  return r3 || (r3 = /* @__PURE__ */ new Map(), t3.set(this, r3)), (r3 = n2(this, r3.get(s3) || (r3.set(s3, r3 = (function(n3) {
    for (var t4, s4, r4 = 1, e3 = "", u3 = "", h3 = [0], p3 = function(n4) {
      1 === r4 && (n4 || (e3 = e3.replace(/^\s*\n\s*|\s*\n\s*$/g, ""))) ? h3.push(0, n4, e3) : 3 === r4 && (n4 || e3) ? (h3.push(3, n4, e3), r4 = 2) : 2 === r4 && "..." === e3 && n4 ? h3.push(4, n4, 0) : 2 === r4 && e3 && !n4 ? h3.push(5, 0, true, e3) : r4 >= 5 && ((e3 || !n4 && 5 === r4) && (h3.push(r4, 0, e3, s4), r4 = 6), n4 && (h3.push(r4, n4, 0, s4), r4 = 6)), e3 = "";
    }, a3 = 0; a3 < n3.length; a3++) {
      a3 && (1 === r4 && p3(), p3(a3));
      for (var l5 = 0; l5 < n3[a3].length; l5++) t4 = n3[a3][l5], 1 === r4 ? "<" === t4 ? (p3(), h3 = [h3], r4 = 3) : e3 += t4 : 4 === r4 ? "--" === e3 && ">" === t4 ? (r4 = 1, e3 = "") : e3 = t4 + e3[0] : u3 ? t4 === u3 ? u3 = "" : e3 += t4 : '"' === t4 || "'" === t4 ? u3 = t4 : ">" === t4 ? (p3(), r4 = 1) : r4 && ("=" === t4 ? (r4 = 5, s4 = e3, e3 = "") : "/" === t4 && (r4 < 5 || ">" === n3[a3][l5 + 1]) ? (p3(), 3 === r4 && (h3 = h3[0]), r4 = h3, (h3 = h3[0]).push(2, 0, r4), r4 = 0) : " " === t4 || "	" === t4 || "\n" === t4 || "\r" === t4 ? (p3(), r4 = 2) : e3 += t4), 3 === r4 && "!--" === e3 && (r4 = 4, h3 = h3[0]);
    }
    return p3(), h3;
  })(s3)), r3), arguments, [])).length > 1 ? r3 : r3[0];
}

// node_modules/marked/lib/marked.esm.js
function z3() {
  return { async: false, breaks: false, extensions: null, gfm: true, hooks: null, pedantic: false, renderer: null, silent: false, tokenizer: null, walkTokens: null };
}
var T3 = z3();
function G2(l5) {
  T3 = l5;
}
var _2 = { exec: () => null };
function d3(l5, e3 = "") {
  let t4 = typeof l5 == "string" ? l5 : l5.source, n3 = { replace: (s3, r3) => {
    let i3 = typeof r3 == "string" ? r3 : r3.source;
    return i3 = i3.replace(m3.caret, "$1"), t4 = t4.replace(s3, i3), n3;
  }, getRegex: () => new RegExp(t4, e3) };
  return n3;
}
var Re = ((l5 = "") => {
  try {
    return !!new RegExp("(?<=1)(?<!1)" + l5);
  } catch {
    return false;
  }
})();
var m3 = { codeRemoveIndent: /^(?: {1,4}| {0,3}\t)/gm, outputLinkReplace: /\\([\[\]])/g, indentCodeCompensation: /^(\s+)(?:```)/, beginningSpace: /^\s+/, endingHash: /#$/, startingSpaceChar: /^ /, endingSpaceChar: / $/, nonSpaceChar: /[^ ]/, newLineCharGlobal: /\n/g, tabCharGlobal: /\t/g, multipleSpaceGlobal: /\s+/g, blankLine: /^[ \t]*$/, doubleBlankLine: /\n[ \t]*\n[ \t]*$/, blockquoteStart: /^ {0,3}>/, blockquoteSetextReplace: /\n {0,3}((?:=+|-+) *)(?=\n|$)/g, blockquoteSetextReplace2: /^ {0,3}>[ \t]?/gm, listReplaceNesting: /^ {1,4}(?=( {4})*[^ ])/g, listIsTask: /^\[[ xX]\] +\S/, listReplaceTask: /^\[[ xX]\] +/, listTaskCheckbox: /\[[ xX]\]/, anyLine: /\n.*\n/, hrefBrackets: /^<(.*)>$/, tableDelimiter: /[:|]/, tableAlignChars: /^\||\| *$/g, tableRowBlankLine: /\n[ \t]*$/, tableAlignRight: /^ *-+: *$/, tableAlignCenter: /^ *:-+: *$/, tableAlignLeft: /^ *:-+ *$/, startATag: /^<a /i, endATag: /^<\/a>/i, startPreScriptTag: /^<(pre|code|kbd|script)(\s|>)/i, endPreScriptTag: /^<\/(pre|code|kbd|script)(\s|>)/i, startAngleBracket: /^</, endAngleBracket: />$/, pedanticHrefTitle: /^([^'"]*[^\s])\s+(['"])(.*)\2/, unicodeAlphaNumeric: /[\p{L}\p{N}]/u, escapeTest: /[&<>"']/, escapeReplace: /[&<>"']/g, escapeTestNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/, escapeReplaceNoEncode: /[<>"']|&(?!(#\d{1,7}|#[Xx][a-fA-F0-9]{1,6}|\w+);)/g, caret: /(^|[^\[])\^/g, percentDecode: /%25/g, findPipe: /\|/g, splitPipe: / \|/, slashPipe: /\\\|/g, carriageReturn: /\r\n|\r/g, spaceLine: /^ +$/gm, notSpaceStart: /^\S*/, endingNewline: /\n$/, listItemRegex: (l5) => new RegExp(`^( {0,3}${l5})((?:[	 ][^\\n]*)?(?:\\n|$))`), nextBulletRegex: (l5) => new RegExp(`^ {0,${Math.min(3, l5 - 1)}}(?:[*+-]|\\d{1,9}[.)])((?:[ 	][^\\n]*)?(?:\\n|$))`), hrRegex: (l5) => new RegExp(`^ {0,${Math.min(3, l5 - 1)}}((?:- *){3,}|(?:_ *){3,}|(?:\\* *){3,})(?:\\n+|$)`), fencesBeginRegex: (l5) => new RegExp(`^ {0,${Math.min(3, l5 - 1)}}(?:\`\`\`|~~~)`), headingBeginRegex: (l5) => new RegExp(`^ {0,${Math.min(3, l5 - 1)}}#`), htmlBeginRegex: (l5) => new RegExp(`^ {0,${Math.min(3, l5 - 1)}}<(?:[a-z].*>|!--)`, "i"), blockquoteBeginRegex: (l5) => new RegExp(`^ {0,${Math.min(3, l5 - 1)}}>`) };
var Te = /^(?:[ \t]*(?:\n|$))+/;
var Oe = /^((?: {4}| {0,3}\t)[^\n]+(?:\n(?:[ \t]*(?:\n|$))*)?)+/;
var we = /^ {0,3}(`{3,}(?=[^`\n]*(?:\n|$))|~{3,})([^\n]*)(?:\n|$)(?:|([\s\S]*?)(?:\n|$))(?: {0,3}\1[~`]* *(?=\n|$)|$)/;
var I2 = /^ {0,3}((?:-[\t ]*){3,}|(?:_[ \t]*){3,}|(?:\*[ \t]*){3,})(?:\n+|$)/;
var ye = /^ {0,3}(#{1,6})(?=\s|$)(.*)(?:\n+|$)/;
var Q2 = / {0,3}(?:[*+-]|\d{1,9}[.)])/;
var ie = /^(?!bull |blockCode|fences|blockquote|heading|html|table)((?:.|\n(?!\s*?\n|bull |blockCode|fences|blockquote|heading|html|table))+?)\n {0,3}(=+|-+) *(?:\n+|$)/;
var oe = d3(ie).replace(/bull/g, Q2).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/\|table/g, "").getRegex();
var Pe = d3(ie).replace(/bull/g, Q2).replace(/blockCode/g, /(?: {4}| {0,3}\t)/).replace(/fences/g, / {0,3}(?:`{3,}|~{3,})/).replace(/blockquote/g, / {0,3}>/).replace(/heading/g, / {0,3}#{1,6}/).replace(/html/g, / {0,3}<[^\n>]+>\n/).replace(/table/g, / {0,3}\|?(?:[:\- ]*\|)+[\:\- ]*\n/).getRegex();
var j3 = /^([^\n]+(?:\n(?!hr|heading|lheading|blockquote|fences|list|html|table| +\n)[^\n]+)*)/;
var Se = /^[^\n]+/;
var F = /(?!\s*\])(?:\\[\s\S]|[^\[\]\\])+/;
var $e = d3(/^ {0,3}\[(label)\]: *(?:\n[ \t]*)?([^<\s][^\s]*|<.*?>)(?:(?: +(?:\n[ \t]*)?| *\n[ \t]*)(title))? *(?:\n+|$)/).replace("label", F).replace("title", /(?:"(?:\\"?|[^"\\])*"|'[^'\n]*(?:\n[^'\n]+)*\n?'|\([^()]*\))/).getRegex();
var Le = d3(/^(bull)([ \t][^\n]+?)?(?:\n|$)/).replace(/bull/g, Q2).getRegex();
var v3 = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|meta|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
var U = /<!--(?:-?>|[\s\S]*?(?:-->|$))/;
var _e = d3("^ {0,3}(?:<(script|pre|style|textarea)[\\s>][\\s\\S]*?(?:</\\1>[^\\n]*\\n+|$)|comment[^\\n]*(\\n+|$)|<\\?[\\s\\S]*?(?:\\?>\\n*|$)|<![A-Z][\\s\\S]*?(?:>\\n*|$)|<!\\[CDATA\\[[\\s\\S]*?(?:\\]\\]>\\n*|$)|</?(tag)(?: +|\\n|/?>)[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|<(?!script|pre|style|textarea)([a-z][\\w-]*)(?:attribute)*? */?>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$)|</(?!script|pre|style|textarea)[a-z][\\w-]*\\s*>(?=[ \\t]*(?:\\n|$))[\\s\\S]*?(?:(?:\\n[ 	]*)+\\n|$))", "i").replace("comment", U).replace("tag", v3).replace("attribute", / +[a-zA-Z:_][\w.:-]*(?: *= *"[^"\n]*"| *= *'[^'\n]*'| *= *[^\s"'=<>`]+)?/).getRegex();
var ae = d3(j3).replace("hr", I2).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("|table", "").replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v3).getRegex();
var Me = d3(/^( {0,3}> ?(paragraph|[^\n]*)(?:\n|$))+/).replace("paragraph", ae).getRegex();
var K2 = { blockquote: Me, code: Oe, def: $e, fences: we, heading: ye, hr: I2, html: _e, lheading: oe, list: Le, newline: Te, paragraph: ae, table: _2, text: Se };
var re = d3("^ *([^\\n ].*)\\n {0,3}((?:\\| *)?:?-+:? *(?:\\| *:?-+:? *)*(?:\\| *)?)(?:\\n((?:(?! *\\n|hr|heading|blockquote|code|fences|list|html).*(?:\\n|$))*)\\n*|$)").replace("hr", I2).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("blockquote", " {0,3}>").replace("code", "(?: {4}| {0,3}	)[^\\n]").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v3).getRegex();
var ze = { ...K2, lheading: Pe, table: re, paragraph: d3(j3).replace("hr", I2).replace("heading", " {0,3}#{1,6}(?:\\s|$)").replace("|lheading", "").replace("table", re).replace("blockquote", " {0,3}>").replace("fences", " {0,3}(?:`{3,}(?=[^`\\n]*\\n)|~{3,})[^\\n]*\\n").replace("list", " {0,3}(?:[*+-]|1[.)])[ \\t]").replace("html", "</?(?:tag)(?: +|\\n|/?>)|<(?:script|pre|style|textarea|!--)").replace("tag", v3).getRegex() };
var Ee = { ...K2, html: d3(`^ *(?:comment *(?:\\n|\\s*$)|<(tag)[\\s\\S]+?</\\1> *(?:\\n{2,}|\\s*$)|<tag(?:"[^"]*"|'[^']*'|\\s[^'"/>\\s]*)*?/?> *(?:\\n{2,}|\\s*$))`).replace("comment", U).replace(/tag/g, "(?!(?:a|em|strong|small|s|cite|q|dfn|abbr|data|time|code|var|samp|kbd|sub|sup|i|b|u|mark|ruby|rt|rp|bdi|bdo|span|br|wbr|ins|del|img)\\b)\\w+(?!:|[^\\w\\s@]*@)\\b").getRegex(), def: /^ *\[([^\]]+)\]: *<?([^\s>]+)>?(?: +(["(][^\n]+[")]))? *(?:\n+|$)/, heading: /^(#{1,6})(.*)(?:\n+|$)/, fences: _2, lheading: /^(.+?)\n {0,3}(=+|-+) *(?:\n+|$)/, paragraph: d3(j3).replace("hr", I2).replace("heading", ` *#{1,6} *[^
]`).replace("lheading", oe).replace("|table", "").replace("blockquote", " {0,3}>").replace("|fences", "").replace("|list", "").replace("|html", "").replace("|tag", "").getRegex() };
var Ae = /^\\([!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~])/;
var Ce = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/;
var le = /^( {2,}|\\)\n(?!\s*$)/;
var Ie = /^(`+|[^`])(?:(?= {2,}\n)|[\s\S]*?(?:(?=[\\<!\[`*_]|\b_|$)|[^ ](?= {2,}\n)))/;
var E2 = /[\p{P}\p{S}]/u;
var H2 = /[\s\p{P}\p{S}]/u;
var W = /[^\s\p{P}\p{S}]/u;
var Be = d3(/^((?![*_])punctSpace)/, "u").replace(/punctSpace/g, H2).getRegex();
var ue = /(?!~)[\p{P}\p{S}]/u;
var De = /(?!~)[\s\p{P}\p{S}]/u;
var qe = /(?:[^\s\p{P}\p{S}]|~)/u;
var ve = d3(/link|precode-code|html/, "g").replace("link", /\[(?:[^\[\]`]|(?<a>`+)[^`]+\k<a>(?!`))*?\]\((?:\\[\s\S]|[^\\\(\)]|\((?:\\[\s\S]|[^\\\(\)])*\))*\)/).replace("precode-", Re ? "(?<!`)()" : "(^^|[^`])").replace("code", /(?<b>`+)[^`]+\k<b>(?!`)/).replace("html", /<(?! )[^<>]*?>/).getRegex();
var pe = /^(?:\*+(?:((?!\*)punct)|([^\s*]))?)|^_+(?:((?!_)punct)|([^\s_]))?/;
var He = d3(pe, "u").replace(/punct/g, E2).getRegex();
var Ze = d3(pe, "u").replace(/punct/g, ue).getRegex();
var ce = "^[^_*]*?__[^_*]*?\\*[^_*]*?(?=__)|[^*]+(?=[^*])|(?!\\*)punct(\\*+)(?=[\\s]|$)|notPunctSpace(\\*+)(?!\\*)(?=punctSpace|$)|(?!\\*)punctSpace(\\*+)(?=notPunctSpace)|[\\s](\\*+)(?!\\*)(?=punct)|(?!\\*)punct(\\*+)(?!\\*)(?=punct)|notPunctSpace(\\*+)(?=notPunctSpace)";
var Ge = d3(ce, "gu").replace(/notPunctSpace/g, W).replace(/punctSpace/g, H2).replace(/punct/g, E2).getRegex();
var Ne = d3(ce, "gu").replace(/notPunctSpace/g, qe).replace(/punctSpace/g, De).replace(/punct/g, ue).getRegex();
var Qe = d3("^[^_*]*?\\*\\*[^_*]*?_[^_*]*?(?=\\*\\*)|[^_]+(?=[^_])|(?!_)punct(_+)(?=[\\s]|$)|notPunctSpace(_+)(?!_)(?=punctSpace|$)|(?!_)punctSpace(_+)(?=notPunctSpace)|[\\s](_+)(?!_)(?=punct)|(?!_)punct(_+)(?!_)(?=punct)", "gu").replace(/notPunctSpace/g, W).replace(/punctSpace/g, H2).replace(/punct/g, E2).getRegex();
var je = d3(/^~~?(?:((?!~)punct)|[^\s~])/, "u").replace(/punct/g, E2).getRegex();
var Fe = "^[^~]+(?=[^~])|(?!~)punct(~~?)(?=[\\s]|$)|notPunctSpace(~~?)(?!~)(?=punctSpace|$)|(?!~)punctSpace(~~?)(?=notPunctSpace)|[\\s](~~?)(?!~)(?=punct)|(?!~)punct(~~?)(?!~)(?=punct)|notPunctSpace(~~?)(?=notPunctSpace)";
var Ue = d3(Fe, "gu").replace(/notPunctSpace/g, W).replace(/punctSpace/g, H2).replace(/punct/g, E2).getRegex();
var Ke = d3(/\\(punct)/, "gu").replace(/punct/g, E2).getRegex();
var We = d3(/^<(scheme:[^\s\x00-\x1f<>]*|email)>/).replace("scheme", /[a-zA-Z][a-zA-Z0-9+.-]{1,31}/).replace("email", /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+(@)[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+(?![-_])/).getRegex();
var Xe = d3(U).replace("(?:-->|$)", "-->").getRegex();
var Je = d3("^comment|^</[a-zA-Z][\\w:-]*\\s*>|^<[a-zA-Z][\\w-]*(?:attribute)*?\\s*/?>|^<\\?[\\s\\S]*?\\?>|^<![a-zA-Z]+\\s[\\s\\S]*?>|^<!\\[CDATA\\[[\\s\\S]*?\\]\\]>").replace("comment", Xe).replace("attribute", /\s+[a-zA-Z:_][\w.:-]*(?:\s*=\s*"[^"]*"|\s*=\s*'[^']*'|\s*=\s*[^\s"'=<>`]+)?/).getRegex();
var q3 = /(?:\[(?:\\[\s\S]|[^\[\]\\])*\]|\\[\s\S]|`+(?!`)[^`]*?`+(?!`)|``+(?=\])|[^\[\]\\`])*?/;
var Ve = d3(/^!?\[(label)\]\(\s*(href)(?:(?:[ \t]+(?:\n[ \t]*)?|\n[ \t]*)(title))?\s*\)/).replace("label", q3).replace("href", /<(?:\\.|[^\n<>\\])+>|[^ \t\n\x00-\x1f]*/).replace("title", /"(?:\\"?|[^"\\])*"|'(?:\\'?|[^'\\])*'|\((?:\\\)?|[^)\\])*\)/).getRegex();
var he = d3(/^!?\[(label)\]\[(ref)\]/).replace("label", q3).replace("ref", F).getRegex();
var ke = d3(/^!?\[(ref)\](?:\[\])?/).replace("ref", F).getRegex();
var Ye = d3("reflink|nolink(?!\\()", "g").replace("reflink", he).replace("nolink", ke).getRegex();
var se = /[hH][tT][tT][pP][sS]?|[fF][tT][pP]/;
var X = { _backpedal: _2, anyPunctuation: Ke, autolink: We, blockSkip: ve, br: le, code: Ce, del: _2, delLDelim: _2, delRDelim: _2, emStrongLDelim: He, emStrongRDelimAst: Ge, emStrongRDelimUnd: Qe, escape: Ae, link: Ve, nolink: ke, punctuation: Be, reflink: he, reflinkSearch: Ye, tag: Je, text: Ie, url: _2 };
var et = { ...X, link: d3(/^!?\[(label)\]\((.*?)\)/).replace("label", q3).getRegex(), reflink: d3(/^!?\[(label)\]\s*\[([^\]]*)\]/).replace("label", q3).getRegex() };
var N2 = { ...X, emStrongRDelimAst: Ne, emStrongLDelim: Ze, delLDelim: je, delRDelim: Ue, url: d3(/^((?:protocol):\/\/|www\.)(?:[a-zA-Z0-9\-]+\.?)+[^\s<]*|^email/).replace("protocol", se).replace("email", /[A-Za-z0-9._+-]+(@)[a-zA-Z0-9-_]+(?:\.[a-zA-Z0-9-_]*[a-zA-Z0-9])+(?![-_])/).getRegex(), _backpedal: /(?:[^?!.,:;*_'"~()&]+|\([^)]*\)|&(?![a-zA-Z0-9]+;$)|[?!.,:;*_'"~)]+(?!$))+/, del: /^(~~?)(?=[^\s~])((?:\\[\s\S]|[^\\])*?(?:\\[\s\S]|[^\s~\\]))\1(?=[^~]|$)/, text: d3(/^([`~]+|[^`~])(?:(?= {2,}\n)|(?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)|[\s\S]*?(?:(?=[\\<!\[`*~_]|\b_|protocol:\/\/|www\.|$)|[^ ](?= {2,}\n)|[^a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-](?=[a-zA-Z0-9.!#$%&'*+\/=?_`{\|}~-]+@)))/).replace("protocol", se).getRegex() };
var tt = { ...N2, br: d3(le).replace("{2,}", "*").getRegex(), text: d3(N2.text).replace("\\b_", "\\b_| {2,}\\n").replace(/\{2,\}/g, "*").getRegex() };
var B3 = { normal: K2, gfm: ze, pedantic: Ee };
var A3 = { normal: X, gfm: N2, breaks: tt, pedantic: et };
var nt = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var de = (l5) => nt[l5];
function O2(l5, e3) {
  if (e3) {
    if (m3.escapeTest.test(l5)) return l5.replace(m3.escapeReplace, de);
  } else if (m3.escapeTestNoEncode.test(l5)) return l5.replace(m3.escapeReplaceNoEncode, de);
  return l5;
}
function J2(l5) {
  try {
    l5 = encodeURI(l5).replace(m3.percentDecode, "%");
  } catch {
    return null;
  }
  return l5;
}
function V2(l5, e3) {
  let t4 = l5.replace(m3.findPipe, (r3, i3, o3) => {
    let u3 = false, a3 = i3;
    for (; --a3 >= 0 && o3[a3] === "\\"; ) u3 = !u3;
    return u3 ? "|" : " |";
  }), n3 = t4.split(m3.splitPipe), s3 = 0;
  if (n3[0].trim() || n3.shift(), n3.length > 0 && !n3.at(-1)?.trim() && n3.pop(), e3) if (n3.length > e3) n3.splice(e3);
  else for (; n3.length < e3; ) n3.push("");
  for (; s3 < n3.length; s3++) n3[s3] = n3[s3].trim().replace(m3.slashPipe, "|");
  return n3;
}
function $2(l5, e3, t4) {
  let n3 = l5.length;
  if (n3 === 0) return "";
  let s3 = 0;
  for (; s3 < n3; ) {
    let r3 = l5.charAt(n3 - s3 - 1);
    if (r3 === e3 && !t4) s3++;
    else if (r3 !== e3 && t4) s3++;
    else break;
  }
  return l5.slice(0, n3 - s3);
}
function Y(l5) {
  let e3 = l5.split(`
`), t4 = e3.length - 1;
  for (; t4 >= 0 && m3.blankLine.test(e3[t4]); ) t4--;
  return e3.length - t4 <= 2 ? l5 : e3.slice(0, t4 + 1).join(`
`);
}
function ge(l5, e3) {
  if (l5.indexOf(e3[1]) === -1) return -1;
  let t4 = 0;
  for (let n3 = 0; n3 < l5.length; n3++) if (l5[n3] === "\\") n3++;
  else if (l5[n3] === e3[0]) t4++;
  else if (l5[n3] === e3[1] && (t4--, t4 < 0)) return n3;
  return t4 > 0 ? -2 : -1;
}
function fe(l5, e3 = 0) {
  let t4 = e3, n3 = "";
  for (let s3 of l5) if (s3 === "	") {
    let r3 = 4 - t4 % 4;
    n3 += " ".repeat(r3), t4 += r3;
  } else n3 += s3, t4++;
  return n3;
}
function me(l5, e3, t4, n3, s3) {
  let r3 = e3.href, i3 = e3.title || null, o3 = l5[1].replace(s3.other.outputLinkReplace, "$1");
  n3.state.inLink = true;
  let u3 = { type: l5[0].charAt(0) === "!" ? "image" : "link", raw: t4, href: r3, title: i3, text: o3, tokens: n3.inlineTokens(o3) };
  return n3.state.inLink = false, u3;
}
function rt(l5, e3, t4) {
  let n3 = l5.match(t4.other.indentCodeCompensation);
  if (n3 === null) return e3;
  let s3 = n3[1];
  return e3.split(`
`).map((r3) => {
    let i3 = r3.match(t4.other.beginningSpace);
    if (i3 === null) return r3;
    let [o3] = i3;
    return o3.length >= s3.length ? r3.slice(s3.length) : r3;
  }).join(`
`);
}
var w3 = class {
  options;
  rules;
  lexer;
  constructor(e3) {
    this.options = e3 || T3;
  }
  space(e3) {
    let t4 = this.rules.block.newline.exec(e3);
    if (t4 && t4[0].length > 0) return { type: "space", raw: t4[0] };
  }
  code(e3) {
    let t4 = this.rules.block.code.exec(e3);
    if (t4) {
      let n3 = this.options.pedantic ? t4[0] : Y(t4[0]), s3 = n3.replace(this.rules.other.codeRemoveIndent, "");
      return { type: "code", raw: n3, codeBlockStyle: "indented", text: s3 };
    }
  }
  fences(e3) {
    let t4 = this.rules.block.fences.exec(e3);
    if (t4) {
      let n3 = t4[0], s3 = rt(n3, t4[3] || "", this.rules);
      return { type: "code", raw: n3, lang: t4[2] ? t4[2].trim().replace(this.rules.inline.anyPunctuation, "$1") : t4[2], text: s3 };
    }
  }
  heading(e3) {
    let t4 = this.rules.block.heading.exec(e3);
    if (t4) {
      let n3 = t4[2].trim();
      if (this.rules.other.endingHash.test(n3)) {
        let s3 = $2(n3, "#");
        (this.options.pedantic || !s3 || this.rules.other.endingSpaceChar.test(s3)) && (n3 = s3.trim());
      }
      return { type: "heading", raw: $2(t4[0], `
`), depth: t4[1].length, text: n3, tokens: this.lexer.inline(n3) };
    }
  }
  hr(e3) {
    let t4 = this.rules.block.hr.exec(e3);
    if (t4) return { type: "hr", raw: $2(t4[0], `
`) };
  }
  blockquote(e3) {
    let t4 = this.rules.block.blockquote.exec(e3);
    if (t4) {
      let n3 = $2(t4[0], `
`).split(`
`), s3 = "", r3 = "", i3 = [];
      for (; n3.length > 0; ) {
        let o3 = false, u3 = [], a3;
        for (a3 = 0; a3 < n3.length; a3++) if (this.rules.other.blockquoteStart.test(n3[a3])) u3.push(n3[a3]), o3 = true;
        else if (!o3) u3.push(n3[a3]);
        else break;
        n3 = n3.slice(a3);
        let c3 = u3.join(`
`), p3 = c3.replace(this.rules.other.blockquoteSetextReplace, `
    $1`).replace(this.rules.other.blockquoteSetextReplace2, "");
        s3 = s3 ? `${s3}
${c3}` : c3, r3 = r3 ? `${r3}
${p3}` : p3;
        let k3 = this.lexer.state.top;
        if (this.lexer.state.top = true, this.lexer.blockTokens(p3, i3, true), this.lexer.state.top = k3, n3.length === 0) break;
        let h3 = i3.at(-1);
        if (h3?.type === "code") break;
        if (h3?.type === "blockquote") {
          let R2 = h3, f3 = R2.raw + `
` + n3.join(`
`), S2 = this.blockquote(f3);
          i3[i3.length - 1] = S2, s3 = s3.substring(0, s3.length - R2.raw.length) + S2.raw, r3 = r3.substring(0, r3.length - R2.text.length) + S2.text;
          break;
        } else if (h3?.type === "list") {
          let R2 = h3, f3 = R2.raw + `
` + n3.join(`
`), S2 = this.list(f3);
          i3[i3.length - 1] = S2, s3 = s3.substring(0, s3.length - h3.raw.length) + S2.raw, r3 = r3.substring(0, r3.length - R2.raw.length) + S2.raw, n3 = f3.substring(i3.at(-1).raw.length).split(`
`);
          continue;
        }
      }
      return { type: "blockquote", raw: s3, tokens: i3, text: r3 };
    }
  }
  list(e3) {
    let t4 = this.rules.block.list.exec(e3);
    if (t4) {
      let n3 = t4[1].trim(), s3 = n3.length > 1, r3 = { type: "list", raw: "", ordered: s3, start: s3 ? +n3.slice(0, -1) : "", loose: false, items: [] };
      n3 = s3 ? `\\d{1,9}\\${n3.slice(-1)}` : `\\${n3}`, this.options.pedantic && (n3 = s3 ? n3 : "[*+-]");
      let i3 = this.rules.other.listItemRegex(n3), o3 = false;
      for (; e3; ) {
        let a3 = false, c3 = "", p3 = "";
        if (!(t4 = i3.exec(e3)) || this.rules.block.hr.test(e3)) break;
        c3 = t4[0], e3 = e3.substring(c3.length);
        let k3 = fe(t4[2].split(`
`, 1)[0], t4[1].length), h3 = e3.split(`
`, 1)[0], R2 = !k3.trim(), f3 = 0;
        if (this.options.pedantic ? (f3 = 2, p3 = k3.trimStart()) : R2 ? f3 = t4[1].length + 1 : (f3 = k3.search(this.rules.other.nonSpaceChar), f3 = f3 > 4 ? 1 : f3, p3 = k3.slice(f3), f3 += t4[1].length), R2 && this.rules.other.blankLine.test(h3) && (c3 += h3 + `
`, e3 = e3.substring(h3.length + 1), a3 = true), !a3) {
          let S2 = this.rules.other.nextBulletRegex(f3), ee = this.rules.other.hrRegex(f3), te = this.rules.other.fencesBeginRegex(f3), ne = this.rules.other.headingBeginRegex(f3), xe = this.rules.other.htmlBeginRegex(f3), be = this.rules.other.blockquoteBeginRegex(f3);
          for (; e3; ) {
            let Z = e3.split(`
`, 1)[0], C3;
            if (h3 = Z, this.options.pedantic ? (h3 = h3.replace(this.rules.other.listReplaceNesting, "  "), C3 = h3) : C3 = h3.replace(this.rules.other.tabCharGlobal, "    "), te.test(h3) || ne.test(h3) || xe.test(h3) || be.test(h3) || S2.test(h3) || ee.test(h3)) break;
            if (C3.search(this.rules.other.nonSpaceChar) >= f3 || !h3.trim()) p3 += `
` + C3.slice(f3);
            else {
              if (R2 || k3.replace(this.rules.other.tabCharGlobal, "    ").search(this.rules.other.nonSpaceChar) >= 4 || te.test(k3) || ne.test(k3) || ee.test(k3)) break;
              p3 += `
` + h3;
            }
            R2 = !h3.trim(), c3 += Z + `
`, e3 = e3.substring(Z.length + 1), k3 = C3.slice(f3);
          }
        }
        r3.loose || (o3 ? r3.loose = true : this.rules.other.doubleBlankLine.test(c3) && (o3 = true)), r3.items.push({ type: "list_item", raw: c3, task: !!this.options.gfm && this.rules.other.listIsTask.test(p3), loose: false, text: p3, tokens: [] }), r3.raw += c3;
      }
      let u3 = r3.items.at(-1);
      if (u3) u3.raw = u3.raw.trimEnd(), u3.text = u3.text.trimEnd();
      else return;
      r3.raw = r3.raw.trimEnd();
      for (let a3 of r3.items) {
        this.lexer.state.top = false, a3.tokens = this.lexer.blockTokens(a3.text, []);
        let c3 = a3.tokens[0];
        if (a3.task && (c3?.type === "text" || c3?.type === "paragraph")) {
          a3.text = a3.text.replace(this.rules.other.listReplaceTask, ""), c3.raw = c3.raw.replace(this.rules.other.listReplaceTask, ""), c3.text = c3.text.replace(this.rules.other.listReplaceTask, "");
          for (let k3 = this.lexer.inlineQueue.length - 1; k3 >= 0; k3--) if (this.rules.other.listIsTask.test(this.lexer.inlineQueue[k3].src)) {
            this.lexer.inlineQueue[k3].src = this.lexer.inlineQueue[k3].src.replace(this.rules.other.listReplaceTask, "");
            break;
          }
          let p3 = this.rules.other.listTaskCheckbox.exec(a3.raw);
          if (p3) {
            let k3 = { type: "checkbox", raw: p3[0] + " ", checked: p3[0] !== "[ ]" };
            a3.checked = k3.checked, r3.loose ? a3.tokens[0] && ["paragraph", "text"].includes(a3.tokens[0].type) && "tokens" in a3.tokens[0] && a3.tokens[0].tokens ? (a3.tokens[0].raw = k3.raw + a3.tokens[0].raw, a3.tokens[0].text = k3.raw + a3.tokens[0].text, a3.tokens[0].tokens.unshift(k3)) : a3.tokens.unshift({ type: "paragraph", raw: k3.raw, text: k3.raw, tokens: [k3] }) : a3.tokens.unshift(k3);
          }
        } else a3.task && (a3.task = false);
        if (!r3.loose) {
          let p3 = a3.tokens.filter((h3) => h3.type === "space"), k3 = p3.length > 0 && p3.some((h3) => this.rules.other.anyLine.test(h3.raw));
          r3.loose = k3;
        }
      }
      if (r3.loose) for (let a3 of r3.items) {
        a3.loose = true;
        for (let c3 of a3.tokens) c3.type === "text" && (c3.type = "paragraph");
      }
      return r3;
    }
  }
  html(e3) {
    let t4 = this.rules.block.html.exec(e3);
    if (t4) {
      let n3 = Y(t4[0]);
      return { type: "html", block: true, raw: n3, pre: t4[1] === "pre" || t4[1] === "script" || t4[1] === "style", text: n3 };
    }
  }
  def(e3) {
    let t4 = this.rules.block.def.exec(e3);
    if (t4) {
      let n3 = t4[1].toLowerCase().replace(this.rules.other.multipleSpaceGlobal, " "), s3 = t4[2] ? t4[2].replace(this.rules.other.hrefBrackets, "$1").replace(this.rules.inline.anyPunctuation, "$1") : "", r3 = t4[3] ? t4[3].substring(1, t4[3].length - 1).replace(this.rules.inline.anyPunctuation, "$1") : t4[3];
      return { type: "def", tag: n3, raw: $2(t4[0], `
`), href: s3, title: r3 };
    }
  }
  table(e3) {
    let t4 = this.rules.block.table.exec(e3);
    if (!t4 || !this.rules.other.tableDelimiter.test(t4[2])) return;
    let n3 = V2(t4[1]), s3 = t4[2].replace(this.rules.other.tableAlignChars, "").split("|"), r3 = t4[3]?.trim() ? t4[3].replace(this.rules.other.tableRowBlankLine, "").split(`
`) : [], i3 = { type: "table", raw: $2(t4[0], `
`), header: [], align: [], rows: [] };
    if (n3.length === s3.length) {
      for (let o3 of s3) this.rules.other.tableAlignRight.test(o3) ? i3.align.push("right") : this.rules.other.tableAlignCenter.test(o3) ? i3.align.push("center") : this.rules.other.tableAlignLeft.test(o3) ? i3.align.push("left") : i3.align.push(null);
      for (let o3 = 0; o3 < n3.length; o3++) i3.header.push({ text: n3[o3], tokens: this.lexer.inline(n3[o3]), header: true, align: i3.align[o3] });
      for (let o3 of r3) i3.rows.push(V2(o3, i3.header.length).map((u3, a3) => ({ text: u3, tokens: this.lexer.inline(u3), header: false, align: i3.align[a3] })));
      return i3;
    }
  }
  lheading(e3) {
    let t4 = this.rules.block.lheading.exec(e3);
    if (t4) {
      let n3 = t4[1].trim();
      return { type: "heading", raw: $2(t4[0], `
`), depth: t4[2].charAt(0) === "=" ? 1 : 2, text: n3, tokens: this.lexer.inline(n3) };
    }
  }
  paragraph(e3) {
    let t4 = this.rules.block.paragraph.exec(e3);
    if (t4) {
      let n3 = t4[1].charAt(t4[1].length - 1) === `
` ? t4[1].slice(0, -1) : t4[1];
      return { type: "paragraph", raw: t4[0], text: n3, tokens: this.lexer.inline(n3) };
    }
  }
  text(e3) {
    let t4 = this.rules.block.text.exec(e3);
    if (t4) return { type: "text", raw: t4[0], text: t4[0], tokens: this.lexer.inline(t4[0]) };
  }
  escape(e3) {
    let t4 = this.rules.inline.escape.exec(e3);
    if (t4) return { type: "escape", raw: t4[0], text: t4[1] };
  }
  tag(e3) {
    let t4 = this.rules.inline.tag.exec(e3);
    if (t4) return !this.lexer.state.inLink && this.rules.other.startATag.test(t4[0]) ? this.lexer.state.inLink = true : this.lexer.state.inLink && this.rules.other.endATag.test(t4[0]) && (this.lexer.state.inLink = false), !this.lexer.state.inRawBlock && this.rules.other.startPreScriptTag.test(t4[0]) ? this.lexer.state.inRawBlock = true : this.lexer.state.inRawBlock && this.rules.other.endPreScriptTag.test(t4[0]) && (this.lexer.state.inRawBlock = false), { type: "html", raw: t4[0], inLink: this.lexer.state.inLink, inRawBlock: this.lexer.state.inRawBlock, block: false, text: t4[0] };
  }
  link(e3) {
    let t4 = this.rules.inline.link.exec(e3);
    if (t4) {
      let n3 = t4[2].trim();
      if (!this.options.pedantic && this.rules.other.startAngleBracket.test(n3)) {
        if (!this.rules.other.endAngleBracket.test(n3)) return;
        let i3 = $2(n3.slice(0, -1), "\\");
        if ((n3.length - i3.length) % 2 === 0) return;
      } else {
        let i3 = ge(t4[2], "()");
        if (i3 === -2) return;
        if (i3 > -1) {
          let u3 = (t4[0].indexOf("!") === 0 ? 5 : 4) + t4[1].length + i3;
          t4[2] = t4[2].substring(0, i3), t4[0] = t4[0].substring(0, u3).trim(), t4[3] = "";
        }
      }
      let s3 = t4[2], r3 = "";
      if (this.options.pedantic) {
        let i3 = this.rules.other.pedanticHrefTitle.exec(s3);
        i3 && (s3 = i3[1], r3 = i3[3]);
      } else r3 = t4[3] ? t4[3].slice(1, -1) : "";
      return s3 = s3.trim(), this.rules.other.startAngleBracket.test(s3) && (this.options.pedantic && !this.rules.other.endAngleBracket.test(n3) ? s3 = s3.slice(1) : s3 = s3.slice(1, -1)), me(t4, { href: s3 && s3.replace(this.rules.inline.anyPunctuation, "$1"), title: r3 && r3.replace(this.rules.inline.anyPunctuation, "$1") }, t4[0], this.lexer, this.rules);
    }
  }
  reflink(e3, t4) {
    let n3;
    if ((n3 = this.rules.inline.reflink.exec(e3)) || (n3 = this.rules.inline.nolink.exec(e3))) {
      let s3 = (n3[2] || n3[1]).replace(this.rules.other.multipleSpaceGlobal, " "), r3 = t4[s3.toLowerCase()];
      if (!r3) {
        let i3 = n3[0].charAt(0);
        return { type: "text", raw: i3, text: i3 };
      }
      return me(n3, r3, n3[0], this.lexer, this.rules);
    }
  }
  emStrong(e3, t4, n3 = "") {
    let s3 = this.rules.inline.emStrongLDelim.exec(e3);
    if (!s3 || !s3[1] && !s3[2] && !s3[3] && !s3[4] || s3[4] && n3.match(this.rules.other.unicodeAlphaNumeric)) return;
    if (!(s3[1] || s3[3] || "") || !n3 || this.rules.inline.punctuation.exec(n3)) {
      let i3 = [...s3[0]].length - 1, o3, u3, a3 = i3, c3 = 0, p3 = s3[0][0] === "*" ? this.rules.inline.emStrongRDelimAst : this.rules.inline.emStrongRDelimUnd;
      for (p3.lastIndex = 0, t4 = t4.slice(-1 * e3.length + i3); (s3 = p3.exec(t4)) !== null; ) {
        if (o3 = s3[1] || s3[2] || s3[3] || s3[4] || s3[5] || s3[6], !o3) continue;
        if (u3 = [...o3].length, s3[3] || s3[4]) {
          a3 += u3;
          continue;
        } else if ((s3[5] || s3[6]) && i3 % 3 && !((i3 + u3) % 3)) {
          c3 += u3;
          continue;
        }
        if (a3 -= u3, a3 > 0) continue;
        u3 = Math.min(u3, u3 + a3 + c3);
        let k3 = [...s3[0]][0].length, h3 = e3.slice(0, i3 + s3.index + k3 + u3);
        if (Math.min(i3, u3) % 2) {
          let f3 = h3.slice(1, -1);
          return { type: "em", raw: h3, text: f3, tokens: this.lexer.inlineTokens(f3) };
        }
        let R2 = h3.slice(2, -2);
        return { type: "strong", raw: h3, text: R2, tokens: this.lexer.inlineTokens(R2) };
      }
    }
  }
  codespan(e3) {
    let t4 = this.rules.inline.code.exec(e3);
    if (t4) {
      let n3 = t4[2].replace(this.rules.other.newLineCharGlobal, " "), s3 = this.rules.other.nonSpaceChar.test(n3), r3 = this.rules.other.startingSpaceChar.test(n3) && this.rules.other.endingSpaceChar.test(n3);
      return s3 && r3 && (n3 = n3.substring(1, n3.length - 1)), { type: "codespan", raw: t4[0], text: n3 };
    }
  }
  br(e3) {
    let t4 = this.rules.inline.br.exec(e3);
    if (t4) return { type: "br", raw: t4[0] };
  }
  del(e3, t4, n3 = "") {
    let s3 = this.rules.inline.delLDelim.exec(e3);
    if (!s3) return;
    if (!(s3[1] || "") || !n3 || this.rules.inline.punctuation.exec(n3)) {
      let i3 = [...s3[0]].length - 1, o3, u3, a3 = i3, c3 = this.rules.inline.delRDelim;
      for (c3.lastIndex = 0, t4 = t4.slice(-1 * e3.length + i3); (s3 = c3.exec(t4)) !== null; ) {
        if (o3 = s3[1] || s3[2] || s3[3] || s3[4] || s3[5] || s3[6], !o3 || (u3 = [...o3].length, u3 !== i3)) continue;
        if (s3[3] || s3[4]) {
          a3 += u3;
          continue;
        }
        if (a3 -= u3, a3 > 0) continue;
        u3 = Math.min(u3, u3 + a3);
        let p3 = [...s3[0]][0].length, k3 = e3.slice(0, i3 + s3.index + p3 + u3), h3 = k3.slice(i3, -i3);
        return { type: "del", raw: k3, text: h3, tokens: this.lexer.inlineTokens(h3) };
      }
    }
  }
  autolink(e3) {
    let t4 = this.rules.inline.autolink.exec(e3);
    if (t4) {
      let n3, s3;
      return t4[2] === "@" ? (n3 = t4[1], s3 = "mailto:" + n3) : (n3 = t4[1], s3 = n3), { type: "link", raw: t4[0], text: n3, href: s3, tokens: [{ type: "text", raw: n3, text: n3 }] };
    }
  }
  url(e3) {
    let t4;
    if (t4 = this.rules.inline.url.exec(e3)) {
      let n3, s3;
      if (t4[2] === "@") n3 = t4[0], s3 = "mailto:" + n3;
      else {
        let r3;
        do
          r3 = t4[0], t4[0] = this.rules.inline._backpedal.exec(t4[0])?.[0] ?? "";
        while (r3 !== t4[0]);
        n3 = t4[0], t4[1] === "www." ? s3 = "http://" + t4[0] : s3 = t4[0];
      }
      return { type: "link", raw: t4[0], text: n3, href: s3, tokens: [{ type: "text", raw: n3, text: n3 }] };
    }
  }
  inlineText(e3) {
    let t4 = this.rules.inline.text.exec(e3);
    if (t4) {
      let n3 = this.lexer.state.inRawBlock;
      return { type: "text", raw: t4[0], text: t4[0], escaped: n3 };
    }
  }
};
var x2 = class l3 {
  tokens;
  options;
  state;
  inlineQueue;
  tokenizer;
  constructor(e3) {
    this.tokens = [], this.tokens.links = /* @__PURE__ */ Object.create(null), this.options = e3 || T3, this.options.tokenizer = this.options.tokenizer || new w3(), this.tokenizer = this.options.tokenizer, this.tokenizer.options = this.options, this.tokenizer.lexer = this, this.inlineQueue = [], this.state = { inLink: false, inRawBlock: false, top: true };
    let t4 = { other: m3, block: B3.normal, inline: A3.normal };
    this.options.pedantic ? (t4.block = B3.pedantic, t4.inline = A3.pedantic) : this.options.gfm && (t4.block = B3.gfm, this.options.breaks ? t4.inline = A3.breaks : t4.inline = A3.gfm), this.tokenizer.rules = t4;
  }
  static get rules() {
    return { block: B3, inline: A3 };
  }
  static lex(e3, t4) {
    return new l3(t4).lex(e3);
  }
  static lexInline(e3, t4) {
    return new l3(t4).inlineTokens(e3);
  }
  lex(e3) {
    e3 = e3.replace(m3.carriageReturn, `
`), this.blockTokens(e3, this.tokens);
    for (let t4 = 0; t4 < this.inlineQueue.length; t4++) {
      let n3 = this.inlineQueue[t4];
      this.inlineTokens(n3.src, n3.tokens);
    }
    return this.inlineQueue = [], this.tokens;
  }
  blockTokens(e3, t4 = [], n3 = false) {
    this.tokenizer.lexer = this, this.options.pedantic && (e3 = e3.replace(m3.tabCharGlobal, "    ").replace(m3.spaceLine, ""));
    let s3 = 1 / 0;
    for (; e3; ) {
      if (e3.length < s3) s3 = e3.length;
      else {
        this.infiniteLoopError(e3.charCodeAt(0));
        break;
      }
      let r3;
      if (this.options.extensions?.block?.some((o3) => (r3 = o3.call({ lexer: this }, e3, t4)) ? (e3 = e3.substring(r3.raw.length), t4.push(r3), true) : false)) continue;
      if (r3 = this.tokenizer.space(e3)) {
        e3 = e3.substring(r3.raw.length);
        let o3 = t4.at(-1);
        r3.raw.length === 1 && o3 !== void 0 ? o3.raw += `
` : t4.push(r3);
        continue;
      }
      if (r3 = this.tokenizer.code(e3)) {
        e3 = e3.substring(r3.raw.length);
        let o3 = t4.at(-1);
        o3?.type === "paragraph" || o3?.type === "text" ? (o3.raw += (o3.raw.endsWith(`
`) ? "" : `
`) + r3.raw, o3.text += `
` + r3.text, this.inlineQueue.at(-1).src = o3.text) : t4.push(r3);
        continue;
      }
      if (r3 = this.tokenizer.fences(e3)) {
        e3 = e3.substring(r3.raw.length), t4.push(r3);
        continue;
      }
      if (r3 = this.tokenizer.heading(e3)) {
        e3 = e3.substring(r3.raw.length), t4.push(r3);
        continue;
      }
      if (r3 = this.tokenizer.hr(e3)) {
        e3 = e3.substring(r3.raw.length), t4.push(r3);
        continue;
      }
      if (r3 = this.tokenizer.blockquote(e3)) {
        e3 = e3.substring(r3.raw.length), t4.push(r3);
        continue;
      }
      if (r3 = this.tokenizer.list(e3)) {
        e3 = e3.substring(r3.raw.length), t4.push(r3);
        continue;
      }
      if (r3 = this.tokenizer.html(e3)) {
        e3 = e3.substring(r3.raw.length), t4.push(r3);
        continue;
      }
      if (r3 = this.tokenizer.def(e3)) {
        e3 = e3.substring(r3.raw.length);
        let o3 = t4.at(-1);
        o3?.type === "paragraph" || o3?.type === "text" ? (o3.raw += (o3.raw.endsWith(`
`) ? "" : `
`) + r3.raw, o3.text += `
` + r3.raw, this.inlineQueue.at(-1).src = o3.text) : this.tokens.links[r3.tag] || (this.tokens.links[r3.tag] = { href: r3.href, title: r3.title }, t4.push(r3));
        continue;
      }
      if (r3 = this.tokenizer.table(e3)) {
        e3 = e3.substring(r3.raw.length), t4.push(r3);
        continue;
      }
      if (r3 = this.tokenizer.lheading(e3)) {
        e3 = e3.substring(r3.raw.length), t4.push(r3);
        continue;
      }
      let i3 = e3;
      if (this.options.extensions?.startBlock) {
        let o3 = 1 / 0, u3 = e3.slice(1), a3;
        this.options.extensions.startBlock.forEach((c3) => {
          a3 = c3.call({ lexer: this }, u3), typeof a3 == "number" && a3 >= 0 && (o3 = Math.min(o3, a3));
        }), o3 < 1 / 0 && o3 >= 0 && (i3 = e3.substring(0, o3 + 1));
      }
      if (this.state.top && (r3 = this.tokenizer.paragraph(i3))) {
        let o3 = t4.at(-1);
        n3 && o3?.type === "paragraph" ? (o3.raw += (o3.raw.endsWith(`
`) ? "" : `
`) + r3.raw, o3.text += `
` + r3.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o3.text) : t4.push(r3), n3 = i3.length !== e3.length, e3 = e3.substring(r3.raw.length);
        continue;
      }
      if (r3 = this.tokenizer.text(e3)) {
        e3 = e3.substring(r3.raw.length);
        let o3 = t4.at(-1);
        o3?.type === "text" ? (o3.raw += (o3.raw.endsWith(`
`) ? "" : `
`) + r3.raw, o3.text += `
` + r3.text, this.inlineQueue.pop(), this.inlineQueue.at(-1).src = o3.text) : t4.push(r3);
        continue;
      }
      if (e3) {
        this.infiniteLoopError(e3.charCodeAt(0));
        break;
      }
    }
    return this.state.top = true, t4;
  }
  inline(e3, t4 = []) {
    return this.inlineQueue.push({ src: e3, tokens: t4 }), t4;
  }
  inlineTokens(e3, t4 = []) {
    this.tokenizer.lexer = this;
    let n3 = e3, s3 = null;
    if (this.tokens.links) {
      let a3 = Object.keys(this.tokens.links);
      if (a3.length > 0) for (; (s3 = this.tokenizer.rules.inline.reflinkSearch.exec(n3)) !== null; ) a3.includes(s3[0].slice(s3[0].lastIndexOf("[") + 1, -1)) && (n3 = n3.slice(0, s3.index) + "[" + "a".repeat(s3[0].length - 2) + "]" + n3.slice(this.tokenizer.rules.inline.reflinkSearch.lastIndex));
    }
    for (; (s3 = this.tokenizer.rules.inline.anyPunctuation.exec(n3)) !== null; ) n3 = n3.slice(0, s3.index) + "++" + n3.slice(this.tokenizer.rules.inline.anyPunctuation.lastIndex);
    let r3;
    for (; (s3 = this.tokenizer.rules.inline.blockSkip.exec(n3)) !== null; ) r3 = s3[2] ? s3[2].length : 0, n3 = n3.slice(0, s3.index + r3) + "[" + "a".repeat(s3[0].length - r3 - 2) + "]" + n3.slice(this.tokenizer.rules.inline.blockSkip.lastIndex);
    n3 = this.options.hooks?.emStrongMask?.call({ lexer: this }, n3) ?? n3;
    let i3 = false, o3 = "", u3 = 1 / 0;
    for (; e3; ) {
      if (e3.length < u3) u3 = e3.length;
      else {
        this.infiniteLoopError(e3.charCodeAt(0));
        break;
      }
      i3 || (o3 = ""), i3 = false;
      let a3;
      if (this.options.extensions?.inline?.some((p3) => (a3 = p3.call({ lexer: this }, e3, t4)) ? (e3 = e3.substring(a3.raw.length), t4.push(a3), true) : false)) continue;
      if (a3 = this.tokenizer.escape(e3)) {
        e3 = e3.substring(a3.raw.length), t4.push(a3);
        continue;
      }
      if (a3 = this.tokenizer.tag(e3)) {
        e3 = e3.substring(a3.raw.length), t4.push(a3);
        continue;
      }
      if (a3 = this.tokenizer.link(e3)) {
        e3 = e3.substring(a3.raw.length), t4.push(a3);
        continue;
      }
      if (a3 = this.tokenizer.reflink(e3, this.tokens.links)) {
        e3 = e3.substring(a3.raw.length);
        let p3 = t4.at(-1);
        a3.type === "text" && p3?.type === "text" ? (p3.raw += a3.raw, p3.text += a3.text) : t4.push(a3);
        continue;
      }
      if (a3 = this.tokenizer.emStrong(e3, n3, o3)) {
        e3 = e3.substring(a3.raw.length), t4.push(a3);
        continue;
      }
      if (a3 = this.tokenizer.codespan(e3)) {
        e3 = e3.substring(a3.raw.length), t4.push(a3);
        continue;
      }
      if (a3 = this.tokenizer.br(e3)) {
        e3 = e3.substring(a3.raw.length), t4.push(a3);
        continue;
      }
      if (a3 = this.tokenizer.del(e3, n3, o3)) {
        e3 = e3.substring(a3.raw.length), t4.push(a3);
        continue;
      }
      if (a3 = this.tokenizer.autolink(e3)) {
        e3 = e3.substring(a3.raw.length), t4.push(a3);
        continue;
      }
      if (!this.state.inLink && (a3 = this.tokenizer.url(e3))) {
        e3 = e3.substring(a3.raw.length), t4.push(a3);
        continue;
      }
      let c3 = e3;
      if (this.options.extensions?.startInline) {
        let p3 = 1 / 0, k3 = e3.slice(1), h3;
        this.options.extensions.startInline.forEach((R2) => {
          h3 = R2.call({ lexer: this }, k3), typeof h3 == "number" && h3 >= 0 && (p3 = Math.min(p3, h3));
        }), p3 < 1 / 0 && p3 >= 0 && (c3 = e3.substring(0, p3 + 1));
      }
      if (a3 = this.tokenizer.inlineText(c3)) {
        e3 = e3.substring(a3.raw.length), a3.raw.slice(-1) !== "_" && (o3 = a3.raw.slice(-1)), i3 = true;
        let p3 = t4.at(-1);
        p3?.type === "text" ? (p3.raw += a3.raw, p3.text += a3.text) : t4.push(a3);
        continue;
      }
      if (e3) {
        this.infiniteLoopError(e3.charCodeAt(0));
        break;
      }
    }
    return t4;
  }
  infiniteLoopError(e3) {
    let t4 = "Infinite loop on byte: " + e3;
    if (this.options.silent) console.error(t4);
    else throw new Error(t4);
  }
};
var y3 = class {
  options;
  parser;
  constructor(e3) {
    this.options = e3 || T3;
  }
  space(e3) {
    return "";
  }
  code({ text: e3, lang: t4, escaped: n3 }) {
    let s3 = (t4 || "").match(m3.notSpaceStart)?.[0], r3 = e3.replace(m3.endingNewline, "") + `
`;
    return s3 ? '<pre><code class="language-' + O2(s3) + '">' + (n3 ? r3 : O2(r3, true)) + `</code></pre>
` : "<pre><code>" + (n3 ? r3 : O2(r3, true)) + `</code></pre>
`;
  }
  blockquote({ tokens: e3 }) {
    return `<blockquote>
${this.parser.parse(e3)}</blockquote>
`;
  }
  html({ text: e3 }) {
    return e3;
  }
  def(e3) {
    return "";
  }
  heading({ tokens: e3, depth: t4 }) {
    return `<h${t4}>${this.parser.parseInline(e3)}</h${t4}>
`;
  }
  hr(e3) {
    return `<hr>
`;
  }
  list(e3) {
    let t4 = e3.ordered, n3 = e3.start, s3 = "";
    for (let o3 = 0; o3 < e3.items.length; o3++) {
      let u3 = e3.items[o3];
      s3 += this.listitem(u3);
    }
    let r3 = t4 ? "ol" : "ul", i3 = t4 && n3 !== 1 ? ' start="' + n3 + '"' : "";
    return "<" + r3 + i3 + `>
` + s3 + "</" + r3 + `>
`;
  }
  listitem(e3) {
    return `<li>${this.parser.parse(e3.tokens)}</li>
`;
  }
  checkbox({ checked: e3 }) {
    return "<input " + (e3 ? 'checked="" ' : "") + 'disabled="" type="checkbox"> ';
  }
  paragraph({ tokens: e3 }) {
    return `<p>${this.parser.parseInline(e3)}</p>
`;
  }
  table(e3) {
    let t4 = "", n3 = "";
    for (let r3 = 0; r3 < e3.header.length; r3++) n3 += this.tablecell(e3.header[r3]);
    t4 += this.tablerow({ text: n3 });
    let s3 = "";
    for (let r3 = 0; r3 < e3.rows.length; r3++) {
      let i3 = e3.rows[r3];
      n3 = "";
      for (let o3 = 0; o3 < i3.length; o3++) n3 += this.tablecell(i3[o3]);
      s3 += this.tablerow({ text: n3 });
    }
    return s3 && (s3 = `<tbody>${s3}</tbody>`), `<table>
<thead>
` + t4 + `</thead>
` + s3 + `</table>
`;
  }
  tablerow({ text: e3 }) {
    return `<tr>
${e3}</tr>
`;
  }
  tablecell(e3) {
    let t4 = this.parser.parseInline(e3.tokens), n3 = e3.header ? "th" : "td";
    return (e3.align ? `<${n3} align="${e3.align}">` : `<${n3}>`) + t4 + `</${n3}>
`;
  }
  strong({ tokens: e3 }) {
    return `<strong>${this.parser.parseInline(e3)}</strong>`;
  }
  em({ tokens: e3 }) {
    return `<em>${this.parser.parseInline(e3)}</em>`;
  }
  codespan({ text: e3 }) {
    return `<code>${O2(e3, true)}</code>`;
  }
  br(e3) {
    return "<br>";
  }
  del({ tokens: e3 }) {
    return `<del>${this.parser.parseInline(e3)}</del>`;
  }
  link({ href: e3, title: t4, tokens: n3 }) {
    let s3 = this.parser.parseInline(n3), r3 = J2(e3);
    if (r3 === null) return s3;
    e3 = r3;
    let i3 = '<a href="' + e3 + '"';
    return t4 && (i3 += ' title="' + O2(t4) + '"'), i3 += ">" + s3 + "</a>", i3;
  }
  image({ href: e3, title: t4, text: n3, tokens: s3 }) {
    s3 && (n3 = this.parser.parseInline(s3, this.parser.textRenderer));
    let r3 = J2(e3);
    if (r3 === null) return O2(n3);
    e3 = r3;
    let i3 = `<img src="${e3}" alt="${O2(n3)}"`;
    return t4 && (i3 += ` title="${O2(t4)}"`), i3 += ">", i3;
  }
  text(e3) {
    return "tokens" in e3 && e3.tokens ? this.parser.parseInline(e3.tokens) : "escaped" in e3 && e3.escaped ? e3.text : O2(e3.text);
  }
};
var L2 = class {
  strong({ text: e3 }) {
    return e3;
  }
  em({ text: e3 }) {
    return e3;
  }
  codespan({ text: e3 }) {
    return e3;
  }
  del({ text: e3 }) {
    return e3;
  }
  html({ text: e3 }) {
    return e3;
  }
  text({ text: e3 }) {
    return e3;
  }
  link({ text: e3 }) {
    return "" + e3;
  }
  image({ text: e3 }) {
    return "" + e3;
  }
  br() {
    return "";
  }
  checkbox({ raw: e3 }) {
    return e3;
  }
};
var b2 = class l4 {
  options;
  renderer;
  textRenderer;
  constructor(e3) {
    this.options = e3 || T3, this.options.renderer = this.options.renderer || new y3(), this.renderer = this.options.renderer, this.renderer.options = this.options, this.renderer.parser = this, this.textRenderer = new L2();
  }
  static parse(e3, t4) {
    return new l4(t4).parse(e3);
  }
  static parseInline(e3, t4) {
    return new l4(t4).parseInline(e3);
  }
  parse(e3) {
    this.renderer.parser = this;
    let t4 = "";
    for (let n3 = 0; n3 < e3.length; n3++) {
      let s3 = e3[n3];
      if (this.options.extensions?.renderers?.[s3.type]) {
        let i3 = s3, o3 = this.options.extensions.renderers[i3.type].call({ parser: this }, i3);
        if (o3 !== false || !["space", "hr", "heading", "code", "table", "blockquote", "list", "html", "def", "paragraph", "text"].includes(i3.type)) {
          t4 += o3 || "";
          continue;
        }
      }
      let r3 = s3;
      switch (r3.type) {
        case "space": {
          t4 += this.renderer.space(r3);
          break;
        }
        case "hr": {
          t4 += this.renderer.hr(r3);
          break;
        }
        case "heading": {
          t4 += this.renderer.heading(r3);
          break;
        }
        case "code": {
          t4 += this.renderer.code(r3);
          break;
        }
        case "table": {
          t4 += this.renderer.table(r3);
          break;
        }
        case "blockquote": {
          t4 += this.renderer.blockquote(r3);
          break;
        }
        case "list": {
          t4 += this.renderer.list(r3);
          break;
        }
        case "checkbox": {
          t4 += this.renderer.checkbox(r3);
          break;
        }
        case "html": {
          t4 += this.renderer.html(r3);
          break;
        }
        case "def": {
          t4 += this.renderer.def(r3);
          break;
        }
        case "paragraph": {
          t4 += this.renderer.paragraph(r3);
          break;
        }
        case "text": {
          t4 += this.renderer.text(r3);
          break;
        }
        default: {
          let i3 = 'Token with "' + r3.type + '" type was not found.';
          if (this.options.silent) return console.error(i3), "";
          throw new Error(i3);
        }
      }
    }
    return t4;
  }
  parseInline(e3, t4 = this.renderer) {
    this.renderer.parser = this;
    let n3 = "";
    for (let s3 = 0; s3 < e3.length; s3++) {
      let r3 = e3[s3];
      if (this.options.extensions?.renderers?.[r3.type]) {
        let o3 = this.options.extensions.renderers[r3.type].call({ parser: this }, r3);
        if (o3 !== false || !["escape", "html", "link", "image", "strong", "em", "codespan", "br", "del", "text"].includes(r3.type)) {
          n3 += o3 || "";
          continue;
        }
      }
      let i3 = r3;
      switch (i3.type) {
        case "escape": {
          n3 += t4.text(i3);
          break;
        }
        case "html": {
          n3 += t4.html(i3);
          break;
        }
        case "link": {
          n3 += t4.link(i3);
          break;
        }
        case "image": {
          n3 += t4.image(i3);
          break;
        }
        case "checkbox": {
          n3 += t4.checkbox(i3);
          break;
        }
        case "strong": {
          n3 += t4.strong(i3);
          break;
        }
        case "em": {
          n3 += t4.em(i3);
          break;
        }
        case "codespan": {
          n3 += t4.codespan(i3);
          break;
        }
        case "br": {
          n3 += t4.br(i3);
          break;
        }
        case "del": {
          n3 += t4.del(i3);
          break;
        }
        case "text": {
          n3 += t4.text(i3);
          break;
        }
        default: {
          let o3 = 'Token with "' + i3.type + '" type was not found.';
          if (this.options.silent) return console.error(o3), "";
          throw new Error(o3);
        }
      }
    }
    return n3;
  }
};
var P2 = class {
  options;
  block;
  constructor(e3) {
    this.options = e3 || T3;
  }
  static passThroughHooks = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens", "emStrongMask"]);
  static passThroughHooksRespectAsync = /* @__PURE__ */ new Set(["preprocess", "postprocess", "processAllTokens"]);
  preprocess(e3) {
    return e3;
  }
  postprocess(e3) {
    return e3;
  }
  processAllTokens(e3) {
    return e3;
  }
  emStrongMask(e3) {
    return e3;
  }
  provideLexer(e3 = this.block) {
    return e3 ? x2.lex : x2.lexInline;
  }
  provideParser(e3 = this.block) {
    return e3 ? b2.parse : b2.parseInline;
  }
};
var D3 = class {
  defaults = z3();
  options = this.setOptions;
  parse = this.parseMarkdown(true);
  parseInline = this.parseMarkdown(false);
  Parser = b2;
  Renderer = y3;
  TextRenderer = L2;
  Lexer = x2;
  Tokenizer = w3;
  Hooks = P2;
  constructor(...e3) {
    this.use(...e3);
  }
  walkTokens(e3, t4) {
    let n3 = [];
    for (let s3 of e3) switch (n3 = n3.concat(t4.call(this, s3)), s3.type) {
      case "table": {
        let r3 = s3;
        for (let i3 of r3.header) n3 = n3.concat(this.walkTokens(i3.tokens, t4));
        for (let i3 of r3.rows) for (let o3 of i3) n3 = n3.concat(this.walkTokens(o3.tokens, t4));
        break;
      }
      case "list": {
        let r3 = s3;
        n3 = n3.concat(this.walkTokens(r3.items, t4));
        break;
      }
      default: {
        let r3 = s3;
        this.defaults.extensions?.childTokens?.[r3.type] ? this.defaults.extensions.childTokens[r3.type].forEach((i3) => {
          let o3 = r3[i3].flat(1 / 0);
          n3 = n3.concat(this.walkTokens(o3, t4));
        }) : r3.tokens && (n3 = n3.concat(this.walkTokens(r3.tokens, t4)));
      }
    }
    return n3;
  }
  use(...e3) {
    let t4 = this.defaults.extensions || { renderers: {}, childTokens: {} };
    return e3.forEach((n3) => {
      let s3 = { ...n3 };
      if (s3.async = this.defaults.async || s3.async || false, n3.extensions && (n3.extensions.forEach((r3) => {
        if (!r3.name) throw new Error("extension name required");
        if ("renderer" in r3) {
          let i3 = t4.renderers[r3.name];
          i3 ? t4.renderers[r3.name] = function(...o3) {
            let u3 = r3.renderer.apply(this, o3);
            return u3 === false && (u3 = i3.apply(this, o3)), u3;
          } : t4.renderers[r3.name] = r3.renderer;
        }
        if ("tokenizer" in r3) {
          if (!r3.level || r3.level !== "block" && r3.level !== "inline") throw new Error("extension level must be 'block' or 'inline'");
          let i3 = t4[r3.level];
          i3 ? i3.unshift(r3.tokenizer) : t4[r3.level] = [r3.tokenizer], r3.start && (r3.level === "block" ? t4.startBlock ? t4.startBlock.push(r3.start) : t4.startBlock = [r3.start] : r3.level === "inline" && (t4.startInline ? t4.startInline.push(r3.start) : t4.startInline = [r3.start]));
        }
        "childTokens" in r3 && r3.childTokens && (t4.childTokens[r3.name] = r3.childTokens);
      }), s3.extensions = t4), n3.renderer) {
        let r3 = this.defaults.renderer || new y3(this.defaults);
        for (let i3 in n3.renderer) {
          if (!(i3 in r3)) throw new Error(`renderer '${i3}' does not exist`);
          if (["options", "parser"].includes(i3)) continue;
          let o3 = i3, u3 = n3.renderer[o3], a3 = r3[o3];
          r3[o3] = (...c3) => {
            let p3 = u3.apply(r3, c3);
            return p3 === false && (p3 = a3.apply(r3, c3)), p3 || "";
          };
        }
        s3.renderer = r3;
      }
      if (n3.tokenizer) {
        let r3 = this.defaults.tokenizer || new w3(this.defaults);
        for (let i3 in n3.tokenizer) {
          if (!(i3 in r3)) throw new Error(`tokenizer '${i3}' does not exist`);
          if (["options", "rules", "lexer"].includes(i3)) continue;
          let o3 = i3, u3 = n3.tokenizer[o3], a3 = r3[o3];
          r3[o3] = (...c3) => {
            let p3 = u3.apply(r3, c3);
            return p3 === false && (p3 = a3.apply(r3, c3)), p3;
          };
        }
        s3.tokenizer = r3;
      }
      if (n3.hooks) {
        let r3 = this.defaults.hooks || new P2();
        for (let i3 in n3.hooks) {
          if (!(i3 in r3)) throw new Error(`hook '${i3}' does not exist`);
          if (["options", "block"].includes(i3)) continue;
          let o3 = i3, u3 = n3.hooks[o3], a3 = r3[o3];
          P2.passThroughHooks.has(i3) ? r3[o3] = (c3) => {
            if (this.defaults.async && P2.passThroughHooksRespectAsync.has(i3)) return (async () => {
              let k3 = await u3.call(r3, c3);
              return a3.call(r3, k3);
            })();
            let p3 = u3.call(r3, c3);
            return a3.call(r3, p3);
          } : r3[o3] = (...c3) => {
            if (this.defaults.async) return (async () => {
              let k3 = await u3.apply(r3, c3);
              return k3 === false && (k3 = await a3.apply(r3, c3)), k3;
            })();
            let p3 = u3.apply(r3, c3);
            return p3 === false && (p3 = a3.apply(r3, c3)), p3;
          };
        }
        s3.hooks = r3;
      }
      if (n3.walkTokens) {
        let r3 = this.defaults.walkTokens, i3 = n3.walkTokens;
        s3.walkTokens = function(o3) {
          let u3 = [];
          return u3.push(i3.call(this, o3)), r3 && (u3 = u3.concat(r3.call(this, o3))), u3;
        };
      }
      this.defaults = { ...this.defaults, ...s3 };
    }), this;
  }
  setOptions(e3) {
    return this.defaults = { ...this.defaults, ...e3 }, this;
  }
  lexer(e3, t4) {
    return x2.lex(e3, t4 ?? this.defaults);
  }
  parser(e3, t4) {
    return b2.parse(e3, t4 ?? this.defaults);
  }
  parseMarkdown(e3) {
    return (n3, s3) => {
      let r3 = { ...s3 }, i3 = { ...this.defaults, ...r3 }, o3 = this.onError(!!i3.silent, !!i3.async);
      if (this.defaults.async === true && r3.async === false) return o3(new Error("marked(): The async option was set to true by an extension. Remove async: false from the parse options object to return a Promise."));
      if (typeof n3 > "u" || n3 === null) return o3(new Error("marked(): input parameter is undefined or null"));
      if (typeof n3 != "string") return o3(new Error("marked(): input parameter is of type " + Object.prototype.toString.call(n3) + ", string expected"));
      if (i3.hooks && (i3.hooks.options = i3, i3.hooks.block = e3), i3.async) return (async () => {
        let u3 = i3.hooks ? await i3.hooks.preprocess(n3) : n3, c3 = await (i3.hooks ? await i3.hooks.provideLexer(e3) : e3 ? x2.lex : x2.lexInline)(u3, i3), p3 = i3.hooks ? await i3.hooks.processAllTokens(c3) : c3;
        i3.walkTokens && await Promise.all(this.walkTokens(p3, i3.walkTokens));
        let h3 = await (i3.hooks ? await i3.hooks.provideParser(e3) : e3 ? b2.parse : b2.parseInline)(p3, i3);
        return i3.hooks ? await i3.hooks.postprocess(h3) : h3;
      })().catch(o3);
      try {
        i3.hooks && (n3 = i3.hooks.preprocess(n3));
        let a3 = (i3.hooks ? i3.hooks.provideLexer(e3) : e3 ? x2.lex : x2.lexInline)(n3, i3);
        i3.hooks && (a3 = i3.hooks.processAllTokens(a3)), i3.walkTokens && this.walkTokens(a3, i3.walkTokens);
        let p3 = (i3.hooks ? i3.hooks.provideParser(e3) : e3 ? b2.parse : b2.parseInline)(a3, i3);
        return i3.hooks && (p3 = i3.hooks.postprocess(p3)), p3;
      } catch (u3) {
        return o3(u3);
      }
    };
  }
  onError(e3, t4) {
    return (n3) => {
      if (n3.message += `
Please report this to https://github.com/markedjs/marked.`, e3) {
        let s3 = "<p>An error occurred:</p><pre>" + O2(n3.message + "", true) + "</pre>";
        return t4 ? Promise.resolve(s3) : s3;
      }
      if (t4) return Promise.reject(n3);
      throw n3;
    };
  }
};
var M = new D3();
function g2(l5, e3) {
  return M.parse(l5, e3);
}
g2.options = g2.setOptions = function(l5) {
  return M.setOptions(l5), g2.defaults = M.defaults, G2(g2.defaults), g2;
};
g2.getDefaults = z3;
g2.defaults = T3;
g2.use = function(...l5) {
  return M.use(...l5), g2.defaults = M.defaults, G2(g2.defaults), g2;
};
g2.walkTokens = function(l5, e3) {
  return M.walkTokens(l5, e3);
};
g2.parseInline = M.parseInline;
g2.Parser = b2;
g2.parser = b2.parse;
g2.Renderer = y3;
g2.TextRenderer = L2;
g2.Lexer = x2;
g2.lexer = x2.lex;
g2.Tokenizer = w3;
g2.Hooks = P2;
g2.parse = g2;
var jt = g2.options;
var Ft = g2.setOptions;
var Ut = g2.use;
var Kt = g2.walkTokens;
var Wt = g2.parseInline;
var Jt = b2.parse;
var Vt = x2.lex;

// node_modules/@bokuweb/zstd-wasm/dist/web/index.web.js
var index_web_exports = {};
__export(index_web_exports, {
  compress: () => compress,
  compressUsingDict: () => compressUsingDict,
  createCCtx: () => createCCtx,
  createDCtx: () => createDCtx,
  decompress: () => decompress,
  decompressUsingDict: () => decompressUsingDict,
  freeCCtx: () => freeCCtx,
  freeDCtx: () => freeDCtx,
  init: () => init2
});

// node_modules/@bokuweb/zstd-wasm/dist/web/zstd.js
var Module2 = typeof Module2 !== "undefined" ? Module2 : {};
var moduleOverrides = {};
var key;
for (key in Module2) {
  if (Module2.hasOwnProperty(key)) {
    moduleOverrides[key] = Module2[key];
  }
}
var arguments_ = [];
var err = Module2["printErr"] || console.warn.bind(console);
for (key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module2[key] = moduleOverrides[key];
  }
}
var quit_ = (status, toThrow) => {
  throw toThrow;
};
moduleOverrides = null;
if (Module2["arguments"])
  arguments_ = Module2["arguments"];
if (Module2["thisProgram"])
  thisProgram = Module2["thisProgram"];
if (Module2["quit"])
  quit_ = Module2["quit"];
if (typeof WebAssembly !== "object") {
  abort("no native wasm support detected");
}
var wasmMemory;
var ABORT = false;
var EXITSTATUS;
var HEAPU8;
var HEAP8;
function updateMemoryViews() {
  var b3 = wasmMemory.buffer;
  Module2["HEAP8"] = HEAP8 = new Int8Array(b3);
  Module2["HEAPU8"] = HEAPU8 = new Uint8Array(b3);
}
var __ATPRERUN__ = [];
var __ATINIT__ = [];
var __ATPOSTRUN__ = [];
var runtimeInitialized = false;
function preRun() {
  if (Module2["preRun"]) {
    if (typeof Module2["preRun"] == "function")
      Module2["preRun"] = [Module2["preRun"]];
    while (Module2["preRun"].length) {
      addOnPreRun(Module2["preRun"].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}
function initRuntime() {
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}
function postRun() {
  if (Module2["postRun"]) {
    if (typeof Module2["postRun"] == "function")
      Module2["postRun"] = [Module2["postRun"]];
    while (Module2["postRun"].length) {
      addOnPostRun(Module2["postRun"].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}
function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}
function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}
function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}
var runDependencies = 0;
var dependenciesFulfilled = null;
function addRunDependency(id) {
  var _a;
  runDependencies++;
  (_a = Module2["monitorRunDependencies"]) === null || _a === void 0 ? void 0 : _a.call(Module2, runDependencies);
}
function removeRunDependency(id) {
  var _a;
  runDependencies--;
  (_a = Module2["monitorRunDependencies"]) === null || _a === void 0 ? void 0 : _a.call(Module2, runDependencies);
  if (runDependencies == 0) {
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback();
    }
  }
}
function abort(what) {
  var _a;
  (_a = Module2["onAbort"]) === null || _a === void 0 ? void 0 : _a.call(Module2, what);
  what = "Aborted(" + what + ")";
  err(what);
  ABORT = true;
  what += ". Build with -sASSERTIONS for more info.";
  var e3 = new WebAssembly.RuntimeError(what);
  throw e3;
}
function getWasmImports() {
  return { a: wasmImports };
}
function getBinaryPromise(url) {
  return fetch(url, { credentials: "same-origin" }).then(function(response) {
    if (!response["ok"]) {
      throw "failed to load wasm binary file at '" + url + "'";
    }
    return response["arrayBuffer"]();
  });
}
function init(filePathOrBuf) {
  var info = getWasmImports();
  function receiveInstance(instance, module) {
    wasmExports = instance.exports;
    wasmMemory = wasmExports["f"];
    updateMemoryViews();
    addOnInit(wasmExports["g"]);
    removeRunDependency("wasm-instantiate");
    return wasmExports;
  }
  addRunDependency("wasm-instantiate");
  function receiveInstantiationResult(result) {
    receiveInstance(result["instance"]);
  }
  function instantiateArrayBuffer(receiver) {
    return getBinaryPromise(filePathOrBuf).then(function(binary) {
      var result = WebAssembly.instantiate(binary, info);
      return result;
    }).then(receiver, function(reason) {
      err("failed to asynchronously prepare wasm: " + reason);
      abort(reason);
    });
  }
  function instantiateAsync() {
    if (filePathOrBuf && filePathOrBuf.byteLength > 0) {
      return WebAssembly.instantiate(filePathOrBuf, info).then(receiveInstantiationResult, function(reason) {
        err("wasm compile failed: " + reason);
      });
    } else if (typeof WebAssembly.instantiateStreaming === "function" && typeof filePathOrBuf === "string" && typeof fetch === "function") {
      return fetch(filePathOrBuf, { credentials: "same-origin" }).then(function(response) {
        var result = WebAssembly.instantiateStreaming(response, info);
        return result.then(receiveInstantiationResult, function(reason) {
          err("wasm streaming compile failed: " + reason);
          err("falling back to ArrayBuffer instantiation");
          return instantiateArrayBuffer(receiveInstantiationResult);
        });
      });
    } else {
      return instantiateArrayBuffer(receiveInstantiationResult);
    }
  }
  if (Module2["instantiateWasm"]) {
    try {
      var exports = Module2["instantiateWasm"](info, receiveInstance);
      return exports;
    } catch (e3) {
      err("Module.instantiateWasm callback failed with error: " + e3);
      return false;
    }
  }
  instantiateAsync();
  return {};
}
var ExitStatus = class {
  constructor(status) {
    this.name = "ExitStatus";
    this.message = `Program terminated with exit(${status})`;
    this.status = status;
  }
};
var callRuntimeCallbacks = (callbacks) => {
  while (callbacks.length > 0) {
    callbacks.shift()(Module2);
  }
};
var noExitRuntime = Module2["noExitRuntime"] || true;
var __abort_js = () => abort("");
var runtimeKeepaliveCounter = 0;
var __emscripten_runtime_keepalive_clear = () => {
  noExitRuntime = false;
  runtimeKeepaliveCounter = 0;
};
var timers = {};
var handleException = (e3) => {
  if (e3 instanceof ExitStatus || e3 == "unwind") {
    return EXITSTATUS;
  }
  quit_(1, e3);
};
var keepRuntimeAlive = () => noExitRuntime || runtimeKeepaliveCounter > 0;
var _proc_exit = (code) => {
  var _a;
  EXITSTATUS = code;
  if (!keepRuntimeAlive()) {
    (_a = Module2["onExit"]) === null || _a === void 0 ? void 0 : _a.call(Module2, code);
    ABORT = true;
  }
  quit_(code, new ExitStatus(code));
};
var exitJS = (status, implicit) => {
  EXITSTATUS = status;
  _proc_exit(status);
};
var _exit = exitJS;
var maybeExit = () => {
  if (!keepRuntimeAlive()) {
    try {
      _exit(EXITSTATUS);
    } catch (e3) {
      handleException(e3);
    }
  }
};
var callUserCallback = (func) => {
  if (ABORT) {
    return;
  }
  try {
    func();
    maybeExit();
  } catch (e3) {
    handleException(e3);
  }
};
var _emscripten_get_now = () => performance.now();
var __setitimer_js = (which, timeout_ms) => {
  if (timers[which]) {
    clearTimeout(timers[which].id);
    delete timers[which];
  }
  if (!timeout_ms)
    return 0;
  var id = setTimeout(() => {
    delete timers[which];
    callUserCallback(() => __emscripten_timeout(which, _emscripten_get_now()));
  }, timeout_ms);
  timers[which] = { id, timeout_ms };
  return 0;
};
var getHeapMax = () => 2147483648;
var alignMemory = (size, alignment) => Math.ceil(size / alignment) * alignment;
var growMemory = (size) => {
  var b3 = wasmMemory.buffer;
  var pages = (size - b3.byteLength + 65535) / 65536 | 0;
  try {
    wasmMemory.grow(pages);
    updateMemoryViews();
    return 1;
  } catch (e3) {
  }
};
var _emscripten_resize_heap = (requestedSize) => {
  var oldSize = HEAPU8.length;
  requestedSize >>>= 0;
  var maxHeapSize = getHeapMax();
  if (requestedSize > maxHeapSize) {
    return false;
  }
  for (var cutDown = 1; cutDown <= 4; cutDown *= 2) {
    var overGrownHeapSize = oldSize * (1 + 0.2 / cutDown);
    overGrownHeapSize = Math.min(overGrownHeapSize, requestedSize + 100663296);
    var newSize = Math.min(maxHeapSize, alignMemory(Math.max(requestedSize, overGrownHeapSize), 65536));
    var replacement = growMemory(newSize);
    if (replacement) {
      return true;
    }
  }
  return false;
};
var wasmImports = {
  c: __abort_js,
  b: __emscripten_runtime_keepalive_clear,
  d: __setitimer_js,
  e: _emscripten_resize_heap,
  a: _proc_exit
};
var wasmExports;
var _ZSTD_isError = Module2["_ZSTD_isError"] = (a0) => (_ZSTD_isError = Module2["_ZSTD_isError"] = wasmExports["h"])(a0);
var _ZSTD_compressBound = Module2["_ZSTD_compressBound"] = (a0) => (_ZSTD_compressBound = Module2["_ZSTD_compressBound"] = wasmExports["i"])(a0);
var _ZSTD_createCCtx = Module2["_ZSTD_createCCtx"] = () => (_ZSTD_createCCtx = Module2["_ZSTD_createCCtx"] = wasmExports["j"])();
var _ZSTD_freeCCtx = Module2["_ZSTD_freeCCtx"] = (a0) => (_ZSTD_freeCCtx = Module2["_ZSTD_freeCCtx"] = wasmExports["k"])(a0);
var _ZSTD_compress_usingDict = Module2["_ZSTD_compress_usingDict"] = (a0, a1, a22, a3, a4, a5, a6, a7) => (_ZSTD_compress_usingDict = Module2["_ZSTD_compress_usingDict"] = wasmExports["l"])(a0, a1, a22, a3, a4, a5, a6, a7);
var _ZSTD_compress = Module2["_ZSTD_compress"] = (a0, a1, a22, a3, a4) => (_ZSTD_compress = Module2["_ZSTD_compress"] = wasmExports["m"])(a0, a1, a22, a3, a4);
var _ZSTD_createDCtx = Module2["_ZSTD_createDCtx"] = () => (_ZSTD_createDCtx = Module2["_ZSTD_createDCtx"] = wasmExports["n"])();
var _ZSTD_freeDCtx = Module2["_ZSTD_freeDCtx"] = (a0) => (_ZSTD_freeDCtx = Module2["_ZSTD_freeDCtx"] = wasmExports["o"])(a0);
var _ZSTD_getFrameContentSize = Module2["_ZSTD_getFrameContentSize"] = (a0, a1) => (_ZSTD_getFrameContentSize = Module2["_ZSTD_getFrameContentSize"] = wasmExports["p"])(a0, a1);
var _ZSTD_decompress_usingDict = Module2["_ZSTD_decompress_usingDict"] = (a0, a1, a22, a3, a4, a5, a6) => (_ZSTD_decompress_usingDict = Module2["_ZSTD_decompress_usingDict"] = wasmExports["q"])(a0, a1, a22, a3, a4, a5, a6);
var _ZSTD_decompress = Module2["_ZSTD_decompress"] = (a0, a1, a22, a3) => (_ZSTD_decompress = Module2["_ZSTD_decompress"] = wasmExports["r"])(a0, a1, a22, a3);
var _malloc = Module2["_malloc"] = (a0) => (_malloc = Module2["_malloc"] = wasmExports["s"])(a0);
var _free = Module2["_free"] = (a0) => (_free = Module2["_free"] = wasmExports["t"])(a0);
var __emscripten_timeout = (a0, a1) => (__emscripten_timeout = wasmExports["v"])(a0, a1);
var calledRun;
dependenciesFulfilled = function runCaller() {
  if (!calledRun)
    run();
  if (!calledRun)
    dependenciesFulfilled = runCaller;
};
function run() {
  if (runDependencies > 0) {
    return;
  }
  preRun();
  if (runDependencies > 0) {
    return;
  }
  function doRun() {
    var _a;
    if (calledRun)
      return;
    calledRun = true;
    Module2["calledRun"] = true;
    if (ABORT)
      return;
    initRuntime();
    (_a = Module2["onRuntimeInitialized"]) === null || _a === void 0 ? void 0 : _a.call(Module2);
    postRun();
  }
  if (Module2["setStatus"]) {
    Module2["setStatus"]("Running...");
    setTimeout(() => {
      setTimeout(() => Module2["setStatus"](""), 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
}
Module2["run"] = run;
if (Module2["preInit"]) {
  if (typeof Module2["preInit"] == "function")
    Module2["preInit"] = [Module2["preInit"]];
  while (Module2["preInit"].length > 0) {
    Module2["preInit"].pop()();
  }
}
Module2["init"] = init;

// node_modules/@bokuweb/zstd-wasm/dist/web/module.js
var __awaiter = function(thisArg, _arguments, P3, generator) {
  function adopt(value) {
    return value instanceof P3 ? value : new P3(function(resolve) {
      resolve(value);
    });
  }
  return new (P3 || (P3 = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e3) {
        reject(e3);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e3) {
        reject(e3);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var initialized = (() => new Promise((resolve) => {
  Module2.onRuntimeInitialized = resolve;
}))();
var waitInitialized = () => __awaiter(void 0, void 0, void 0, function* () {
  yield initialized;
});

// node_modules/@bokuweb/zstd-wasm/dist/web/errors/index.js
var isError = (code) => {
  const _isError = Module2["_ZSTD_isError"];
  return _isError(code);
};

// node_modules/@bokuweb/zstd-wasm/dist/web/simple/decompress.js
var getFrameContentSize = (src, size) => {
  const getSize = Module2["_ZSTD_getFrameContentSize"];
  return getSize(src, size);
};
var decompress = (buf, opts = { defaultHeapSize: 1024 * 1024 }) => {
  const malloc = Module2["_malloc"];
  const src = malloc(buf.byteLength);
  Module2.HEAP8.set(buf, src);
  const contentSize = getFrameContentSize(src, buf.byteLength);
  const size = contentSize === -1 ? opts.defaultHeapSize : contentSize;
  const free = Module2["_free"];
  const heap = malloc(size);
  try {
    const _decompress = Module2["_ZSTD_decompress"];
    const sizeOrError = _decompress(heap, size, src, buf.byteLength);
    if (isError(sizeOrError)) {
      throw new Error(`Failed to compress with code ${sizeOrError}`);
    }
    const data = new Uint8Array(Module2.HEAPU8.buffer, heap, sizeOrError).slice();
    free(heap, size);
    free(src, buf.byteLength);
    return data;
  } catch (e3) {
    free(heap, size);
    free(src, buf.byteLength);
    throw e3;
  }
};

// node_modules/@bokuweb/zstd-wasm/dist/web/simple/compress.js
var compressBound = (size) => {
  const bound = Module2["_ZSTD_compressBound"];
  return bound(size);
};
var compress = (buf, level) => {
  const bound = compressBound(buf.byteLength);
  const malloc = Module2["_malloc"];
  const compressed = malloc(bound);
  const src = malloc(buf.byteLength);
  Module2.HEAP8.set(buf, src);
  const free = Module2["_free"];
  try {
    const _compress = Module2["_ZSTD_compress"];
    const sizeOrError = _compress(compressed, bound, src, buf.byteLength, level !== null && level !== void 0 ? level : 3);
    if (isError(sizeOrError)) {
      throw new Error(`Failed to compress with code ${sizeOrError}`);
    }
    const data = new Uint8Array(Module2.HEAPU8.buffer, compressed, sizeOrError).slice();
    free(compressed, bound);
    free(src, buf.byteLength);
    return data;
  } catch (e3) {
    free(compressed, bound);
    free(src, buf.byteLength);
    throw e3;
  }
};

// node_modules/@bokuweb/zstd-wasm/dist/web/simple/decompress_using_dict.js
var getFrameContentSize2 = (src, size) => {
  const getSize = Module2["_ZSTD_getFrameContentSize"];
  return getSize(src, size);
};
var createDCtx = () => {
  return Module2["_ZSTD_createDCtx"]();
};
var freeDCtx = (dctx) => {
  return Module2["_ZSTD_freeDCtx"](dctx);
};
var decompressUsingDict = (dctx, buf, dict, opts = { defaultHeapSize: 1024 * 1024 }) => {
  const malloc = Module2["_malloc"];
  const src = malloc(buf.byteLength);
  Module2.HEAP8.set(buf, src);
  const pdict = malloc(dict.byteLength);
  Module2.HEAP8.set(dict, pdict);
  const contentSize = getFrameContentSize2(src, buf.byteLength);
  const size = contentSize === -1 ? opts.defaultHeapSize : contentSize;
  const free = Module2["_free"];
  const heap = malloc(size);
  try {
    const _decompress = Module2["_ZSTD_decompress_usingDict"];
    const sizeOrError = _decompress(dctx, heap, size, src, buf.byteLength, pdict, dict.byteLength);
    if (isError(sizeOrError)) {
      throw new Error(`Failed to compress with code ${sizeOrError}`);
    }
    const data = new Uint8Array(Module2.HEAPU8.buffer, heap, sizeOrError).slice();
    free(heap, size);
    free(src, buf.byteLength);
    free(pdict, dict.byteLength);
    return data;
  } catch (e3) {
    free(heap, size);
    free(src, buf.byteLength);
    free(pdict, dict.byteLength);
    throw e3;
  }
};

// node_modules/@bokuweb/zstd-wasm/dist/web/simple/compress_using_dict.js
var compressBound2 = (size) => {
  const bound = Module2["_ZSTD_compressBound"];
  return bound(size);
};
var createCCtx = () => {
  return Module2["_ZSTD_createCCtx"]();
};
var freeCCtx = (cctx) => {
  return Module2["_ZSTD_freeCCtx"](cctx);
};
var compressUsingDict = (cctx, buf, dict, level) => {
  const bound = compressBound2(buf.byteLength);
  const malloc = Module2["_malloc"];
  const compressed = malloc(bound);
  const src = malloc(buf.byteLength);
  Module2.HEAP8.set(buf, src);
  const pdict = malloc(dict.byteLength);
  Module2.HEAP8.set(dict, pdict);
  const free = Module2["_free"];
  try {
    const _compress = Module2["_ZSTD_compress_usingDict"];
    const sizeOrError = _compress(cctx, compressed, bound, src, buf.byteLength, pdict, dict.byteLength, level !== null && level !== void 0 ? level : 3);
    if (isError(sizeOrError)) {
      throw new Error(`Failed to compress with code ${sizeOrError}`);
    }
    const data = new Uint8Array(Module2.HEAPU8.buffer, compressed, sizeOrError).slice();
    free(compressed, bound);
    free(src, buf.byteLength);
    free(pdict, dict.byteLength);
    return data;
  } catch (e3) {
    free(compressed, bound);
    free(src, buf.byteLength);
    free(pdict, dict.byteLength);
    throw e3;
  }
};

// node_modules/@bokuweb/zstd-wasm/dist/web/index.web.js
var __awaiter2 = function(thisArg, _arguments, P3, generator) {
  function adopt(value) {
    return value instanceof P3 ? value : new P3(function(resolve) {
      resolve(value);
    });
  }
  return new (P3 || (P3 = Promise))(function(resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e3) {
        reject(e3);
      }
    }
    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e3) {
        reject(e3);
      }
    }
    function step(result) {
      result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
    }
    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
};
var init2 = (path) => __awaiter2(void 0, void 0, void 0, function* () {
  const url = new URL(`./zstd.wasm`, import.meta.url).href;
  Module2["init"](path !== null && path !== void 0 ? path : url);
  yield waitInitialized();
});

// libraries.js
var Argon2 = __toESM(require_argon23());
export {
  Argon2,
  S as Fragment,
  index_web_exports as ZstdWasm,
  k as h,
  htm_module_default as htm,
  g2 as marked,
  R as render,
  q2 as useCallback,
  y2 as useEffect,
  A2 as useRef,
  d2 as useState
};
