import {
  __commonJS,
  __esm,
  __glob,
  __require
} from "./chunk-73FKUHZS.js";

// node_modules/onnxruntime-common/dist/cjs/backend-impl.js
var require_backend_impl = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/backend-impl.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.resolveBackendAndExecutionProviders = exports.registerBackend = void 0;
    var backends = /* @__PURE__ */ new Map();
    var backendsSortedByPriority = [];
    var registerBackend = (name, backend, priority) => {
      if (backend && typeof backend.init === "function" && typeof backend.createInferenceSessionHandler === "function") {
        const currentBackend = backends.get(name);
        if (currentBackend === void 0) {
          backends.set(name, { backend, priority });
        } else if (currentBackend.priority > priority) {
          return;
        } else if (currentBackend.priority === priority) {
          if (currentBackend.backend !== backend) {
            throw new Error(`cannot register backend "${name}" using priority ${priority}`);
          }
        }
        if (priority >= 0) {
          const i = backendsSortedByPriority.indexOf(name);
          if (i !== -1) {
            backendsSortedByPriority.splice(i, 1);
          }
          for (let i2 = 0; i2 < backendsSortedByPriority.length; i2++) {
            if (backends.get(backendsSortedByPriority[i2]).priority <= priority) {
              backendsSortedByPriority.splice(i2, 0, name);
              return;
            }
          }
          backendsSortedByPriority.push(name);
        }
        return;
      }
      throw new TypeError("not a valid backend");
    };
    exports.registerBackend = registerBackend;
    var tryResolveAndInitializeBackend = async (backendName) => {
      const backendInfo = backends.get(backendName);
      if (!backendInfo) {
        return "backend not found.";
      }
      if (backendInfo.initialized) {
        return backendInfo.backend;
      } else if (backendInfo.aborted) {
        return backendInfo.error;
      } else {
        const isInitializing = !!backendInfo.initPromise;
        try {
          if (!isInitializing) {
            backendInfo.initPromise = backendInfo.backend.init(backendName);
          }
          await backendInfo.initPromise;
          backendInfo.initialized = true;
          return backendInfo.backend;
        } catch (e) {
          if (!isInitializing) {
            backendInfo.error = `${e}`;
            backendInfo.aborted = true;
          }
          return backendInfo.error;
        } finally {
          delete backendInfo.initPromise;
        }
      }
    };
    var resolveBackendAndExecutionProviders = async (options) => {
      const eps = options.executionProviders || [];
      const backendHints = eps.map((i) => typeof i === "string" ? i : i.name);
      const backendNames = backendHints.length === 0 ? backendsSortedByPriority : backendHints;
      let backend;
      const errors = [];
      const availableBackendNames = /* @__PURE__ */ new Set();
      for (const backendName of backendNames) {
        const resolveResult = await tryResolveAndInitializeBackend(backendName);
        if (typeof resolveResult === "string") {
          errors.push({ name: backendName, err: resolveResult });
        } else {
          if (!backend) {
            backend = resolveResult;
          }
          if (backend === resolveResult) {
            availableBackendNames.add(backendName);
          }
        }
      }
      if (!backend) {
        throw new Error(`no available backend found. ERR: ${errors.map((e) => `[${e.name}] ${e.err}`).join(", ")}`);
      }
      for (const { name, err } of errors) {
        if (backendHints.includes(name)) {
          console.warn(`removing requested execution provider "${name}" from session options because it is not available: ${err}`);
        }
      }
      const filteredEps = eps.filter((i) => availableBackendNames.has(typeof i === "string" ? i : i.name));
      return [
        backend,
        new Proxy(options, {
          get: (target, prop) => {
            if (prop === "executionProviders") {
              return filteredEps;
            }
            return Reflect.get(target, prop);
          }
        })
      ];
    };
    exports.resolveBackendAndExecutionProviders = resolveBackendAndExecutionProviders;
  }
});

// node_modules/onnxruntime-common/dist/cjs/backend.js
var require_backend = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/backend.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.registerBackend = void 0;
    var backend_impl_js_1 = require_backend_impl();
    Object.defineProperty(exports, "registerBackend", { enumerable: true, get: function() {
      return backend_impl_js_1.registerBackend;
    } });
  }
});

// node_modules/onnxruntime-common/dist/cjs/version.js
var require_version = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/version.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.version = void 0;
    exports.version = "1.30.0";
  }
});

// node_modules/onnxruntime-common/dist/cjs/env-impl.js
var require_env_impl = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/env-impl.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.env = void 0;
    var version_js_1 = require_version();
    var logLevelValue = "warning";
    exports.env = {
      wasm: {},
      webgl: {},
      webgpu: {},
      versions: { common: version_js_1.version },
      set logLevel(value) {
        if (value === void 0) {
          return;
        }
        if (typeof value !== "string" || ["verbose", "info", "warning", "error", "fatal"].indexOf(value) === -1) {
          throw new Error(`Unsupported logging level: ${value}`);
        }
        logLevelValue = value;
      },
      get logLevel() {
        return logLevelValue;
      }
    };
    Object.defineProperty(exports.env, "logLevel", { enumerable: true });
  }
});

// node_modules/onnxruntime-common/dist/cjs/env.js
var require_env = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/env.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.env = void 0;
    var env_impl_js_1 = require_env_impl();
    exports.env = env_impl_js_1.env;
  }
});

// node_modules/onnxruntime-common/dist/cjs/tensor-conversion-impl.js
var require_tensor_conversion_impl = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/tensor-conversion-impl.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.tensorToImageData = exports.tensorToDataURL = void 0;
    var tensorToDataURL = (tensor, options) => {
      const canvas = typeof document !== "undefined" ? document.createElement("canvas") : new OffscreenCanvas(1, 1);
      canvas.width = tensor.dims[3];
      canvas.height = tensor.dims[2];
      const pixels2DContext = canvas.getContext("2d");
      if (pixels2DContext != null) {
        let width;
        let height;
        if (options?.tensorLayout !== void 0 && options.tensorLayout === "NHWC") {
          width = tensor.dims[2];
          height = tensor.dims[3];
        } else {
          width = tensor.dims[3];
          height = tensor.dims[2];
        }
        const inputformat = options?.format !== void 0 ? options.format : "RGB";
        const norm = options?.norm;
        let normMean;
        let normBias;
        if (norm === void 0 || norm.mean === void 0) {
          normMean = [255, 255, 255, 255];
        } else {
          if (typeof norm.mean === "number") {
            normMean = [norm.mean, norm.mean, norm.mean, norm.mean];
          } else {
            normMean = [norm.mean[0], norm.mean[1], norm.mean[2], 0];
            if (norm.mean[3] !== void 0) {
              normMean[3] = norm.mean[3];
            }
          }
        }
        if (norm === void 0 || norm.bias === void 0) {
          normBias = [0, 0, 0, 0];
        } else {
          if (typeof norm.bias === "number") {
            normBias = [norm.bias, norm.bias, norm.bias, norm.bias];
          } else {
            normBias = [norm.bias[0], norm.bias[1], norm.bias[2], 0];
            if (norm.bias[3] !== void 0) {
              normBias[3] = norm.bias[3];
            }
          }
        }
        const stride = height * width;
        let rTensorPointer = 0, gTensorPointer = stride, bTensorPointer = stride * 2, aTensorPointer = -1;
        if (inputformat === "RGBA") {
          rTensorPointer = 0;
          gTensorPointer = stride;
          bTensorPointer = stride * 2;
          aTensorPointer = stride * 3;
        } else if (inputformat === "RGB") {
          rTensorPointer = 0;
          gTensorPointer = stride;
          bTensorPointer = stride * 2;
        } else if (inputformat === "RBG") {
          rTensorPointer = 0;
          bTensorPointer = stride;
          gTensorPointer = stride * 2;
        }
        for (let i = 0; i < height; i++) {
          for (let j = 0; j < width; j++) {
            const R = (tensor.data[rTensorPointer++] - normBias[0]) * normMean[0];
            const G = (tensor.data[gTensorPointer++] - normBias[1]) * normMean[1];
            const B = (tensor.data[bTensorPointer++] - normBias[2]) * normMean[2];
            const A = aTensorPointer === -1 ? 255 : (tensor.data[aTensorPointer++] - normBias[3]) * normMean[3];
            pixels2DContext.fillStyle = "rgba(" + R + "," + G + "," + B + "," + A + ")";
            pixels2DContext.fillRect(j, i, 1, 1);
          }
        }
        if ("toDataURL" in canvas) {
          return canvas.toDataURL();
        } else {
          throw new Error("toDataURL is not supported");
        }
      } else {
        throw new Error("Can not access image data");
      }
    };
    exports.tensorToDataURL = tensorToDataURL;
    var tensorToImageData = (tensor, options) => {
      const pixels2DContext = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : new OffscreenCanvas(1, 1).getContext("2d");
      let image;
      if (pixels2DContext != null) {
        let width;
        let height;
        let channels;
        if (options?.tensorLayout !== void 0 && options.tensorLayout === "NHWC") {
          width = tensor.dims[2];
          height = tensor.dims[1];
          channels = tensor.dims[3];
        } else {
          width = tensor.dims[3];
          height = tensor.dims[2];
          channels = tensor.dims[1];
        }
        const inputformat = options !== void 0 ? options.format !== void 0 ? options.format : "RGB" : "RGB";
        const norm = options?.norm;
        let normMean;
        let normBias;
        if (norm === void 0 || norm.mean === void 0) {
          normMean = [255, 255, 255, 255];
        } else {
          if (typeof norm.mean === "number") {
            normMean = [norm.mean, norm.mean, norm.mean, norm.mean];
          } else {
            normMean = [norm.mean[0], norm.mean[1], norm.mean[2], 255];
            if (norm.mean[3] !== void 0) {
              normMean[3] = norm.mean[3];
            }
          }
        }
        if (norm === void 0 || norm.bias === void 0) {
          normBias = [0, 0, 0, 0];
        } else {
          if (typeof norm.bias === "number") {
            normBias = [norm.bias, norm.bias, norm.bias, norm.bias];
          } else {
            normBias = [norm.bias[0], norm.bias[1], norm.bias[2], 0];
            if (norm.bias[3] !== void 0) {
              normBias[3] = norm.bias[3];
            }
          }
        }
        const stride = height * width;
        if (options !== void 0) {
          if (options.format !== void 0 && channels === 4 && options.format !== "RGBA" || channels === 3 && options.format !== "RGB" && options.format !== "BGR") {
            throw new Error("Tensor format doesn't match input tensor dims");
          }
        }
        const step = 4;
        let rImagePointer = 0, gImagePointer = 1, bImagePointer = 2, aImagePointer = 3;
        let rTensorPointer = 0, gTensorPointer = stride, bTensorPointer = stride * 2, aTensorPointer = -1;
        if (inputformat === "RGBA") {
          rTensorPointer = 0;
          gTensorPointer = stride;
          bTensorPointer = stride * 2;
          aTensorPointer = stride * 3;
        } else if (inputformat === "RGB") {
          rTensorPointer = 0;
          gTensorPointer = stride;
          bTensorPointer = stride * 2;
        } else if (inputformat === "RBG") {
          rTensorPointer = 0;
          bTensorPointer = stride;
          gTensorPointer = stride * 2;
        }
        image = pixels2DContext.createImageData(width, height);
        for (let i = 0; i < height * width; rImagePointer += step, gImagePointer += step, bImagePointer += step, aImagePointer += step, i++) {
          image.data[rImagePointer] = (tensor.data[rTensorPointer++] - normBias[0]) * normMean[0];
          image.data[gImagePointer] = (tensor.data[gTensorPointer++] - normBias[1]) * normMean[1];
          image.data[bImagePointer] = (tensor.data[bTensorPointer++] - normBias[2]) * normMean[2];
          image.data[aImagePointer] = aTensorPointer === -1 ? 255 : (tensor.data[aTensorPointer++] - normBias[3]) * normMean[3];
        }
      } else {
        throw new Error("Can not access image data");
      }
      return image;
    };
    exports.tensorToImageData = tensorToImageData;
  }
});

// node_modules/onnxruntime-common/dist/cjs/tensor-factory-impl.js
var require_tensor_factory_impl = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/tensor-factory-impl.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.tensorFromPinnedBuffer = exports.tensorFromMLTensor = exports.tensorFromGpuBuffer = exports.tensorFromTexture = exports.tensorFromImage = exports.bufferToTensor = void 0;
    var tensor_impl_js_1 = require_tensor_impl();
    var bufferToTensor = (buffer, options) => {
      if (buffer === void 0) {
        throw new Error("Image buffer must be defined");
      }
      if (options.height === void 0 || options.width === void 0) {
        throw new Error("Image height and width must be defined");
      }
      if (options.tensorLayout === "NHWC") {
        throw new Error("NHWC Tensor layout is not supported yet");
      }
      const { height, width } = options;
      const norm = options.norm ?? { mean: 255, bias: 0 };
      let normMean;
      let normBias;
      if (typeof norm.mean === "number") {
        normMean = [norm.mean, norm.mean, norm.mean, norm.mean];
      } else {
        normMean = [norm.mean[0], norm.mean[1], norm.mean[2], norm.mean[3] ?? 255];
      }
      if (typeof norm.bias === "number") {
        normBias = [norm.bias, norm.bias, norm.bias, norm.bias];
      } else {
        normBias = [norm.bias[0], norm.bias[1], norm.bias[2], norm.bias[3] ?? 0];
      }
      const inputformat = options.format !== void 0 ? options.format : "RGBA";
      const outputformat = options.tensorFormat !== void 0 ? options.tensorFormat !== void 0 ? options.tensorFormat : "RGB" : "RGB";
      const stride = height * width;
      const float32Data = outputformat === "RGBA" ? new Float32Array(stride * 4) : new Float32Array(stride * 3);
      let step = 4, rImagePointer = 0, gImagePointer = 1, bImagePointer = 2, aImagePointer = 3;
      let rTensorPointer = 0, gTensorPointer = stride, bTensorPointer = stride * 2, aTensorPointer = -1;
      if (inputformat === "RGB") {
        step = 3;
        rImagePointer = 0;
        gImagePointer = 1;
        bImagePointer = 2;
        aImagePointer = -1;
      }
      if (outputformat === "RGBA") {
        aTensorPointer = stride * 3;
      } else if (outputformat === "RBG") {
        rTensorPointer = 0;
        bTensorPointer = stride;
        gTensorPointer = stride * 2;
      } else if (outputformat === "BGR") {
        bTensorPointer = 0;
        gTensorPointer = stride;
        rTensorPointer = stride * 2;
      }
      for (let i = 0; i < stride; i++, rImagePointer += step, bImagePointer += step, gImagePointer += step, aImagePointer += step) {
        float32Data[rTensorPointer++] = (buffer[rImagePointer] + normBias[0]) / normMean[0];
        float32Data[gTensorPointer++] = (buffer[gImagePointer] + normBias[1]) / normMean[1];
        float32Data[bTensorPointer++] = (buffer[bImagePointer] + normBias[2]) / normMean[2];
        if (aTensorPointer !== -1 && aImagePointer !== -1) {
          float32Data[aTensorPointer++] = (buffer[aImagePointer] + normBias[3]) / normMean[3];
        }
      }
      const outputTensor = outputformat === "RGBA" ? new tensor_impl_js_1.Tensor("float32", float32Data, [1, 4, height, width]) : new tensor_impl_js_1.Tensor("float32", float32Data, [1, 3, height, width]);
      return outputTensor;
    };
    exports.bufferToTensor = bufferToTensor;
    var tensorFromImage = async (image, options) => {
      const isHTMLImageEle = typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement;
      const isImageDataEle = typeof ImageData !== "undefined" && image instanceof ImageData;
      const isImageBitmap = typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap;
      const isString = typeof image === "string";
      let data;
      let bufferToTensorOptions = options ?? {};
      const createCanvas = () => {
        if (typeof document !== "undefined") {
          return document.createElement("canvas");
        } else if (typeof OffscreenCanvas !== "undefined") {
          return new OffscreenCanvas(1, 1);
        } else {
          throw new Error("Canvas is not supported");
        }
      };
      const createCanvasContext = (canvas) => {
        if (typeof HTMLCanvasElement !== "undefined" && canvas instanceof HTMLCanvasElement) {
          return canvas.getContext("2d");
        } else if (canvas instanceof OffscreenCanvas) {
          return canvas.getContext("2d");
        } else {
          return null;
        }
      };
      if (isHTMLImageEle) {
        const canvas = createCanvas();
        canvas.width = image.width;
        canvas.height = image.height;
        const pixels2DContext = createCanvasContext(canvas);
        if (pixels2DContext != null) {
          let height = image.height;
          let width = image.width;
          if (options !== void 0 && options.resizedHeight !== void 0 && options.resizedWidth !== void 0) {
            height = options.resizedHeight;
            width = options.resizedWidth;
          }
          if (options !== void 0) {
            bufferToTensorOptions = options;
            if (options.tensorFormat !== void 0) {
              throw new Error("Image input config format must be RGBA for HTMLImageElement");
            } else {
              bufferToTensorOptions.tensorFormat = "RGBA";
            }
            bufferToTensorOptions.height = height;
            bufferToTensorOptions.width = width;
          } else {
            bufferToTensorOptions.tensorFormat = "RGBA";
            bufferToTensorOptions.height = height;
            bufferToTensorOptions.width = width;
          }
          pixels2DContext.drawImage(image, 0, 0);
          data = pixels2DContext.getImageData(0, 0, width, height).data;
        } else {
          throw new Error("Can not access image data");
        }
      } else if (isImageDataEle) {
        let height;
        let width;
        if (options !== void 0 && options.resizedWidth !== void 0 && options.resizedHeight !== void 0) {
          height = options.resizedHeight;
          width = options.resizedWidth;
        } else {
          height = image.height;
          width = image.width;
        }
        if (options !== void 0) {
          bufferToTensorOptions = options;
        }
        bufferToTensorOptions.format = "RGBA";
        bufferToTensorOptions.height = height;
        bufferToTensorOptions.width = width;
        if (options !== void 0) {
          const tempCanvas = createCanvas();
          tempCanvas.width = width;
          tempCanvas.height = height;
          const pixels2DContext = createCanvasContext(tempCanvas);
          if (pixels2DContext != null) {
            pixels2DContext.putImageData(image, 0, 0);
            data = pixels2DContext.getImageData(0, 0, width, height).data;
          } else {
            throw new Error("Can not access image data");
          }
        } else {
          data = image.data;
        }
      } else if (isImageBitmap) {
        if (options === void 0) {
          throw new Error("Please provide image config with format for Imagebitmap");
        }
        const canvas = createCanvas();
        canvas.width = image.width;
        canvas.height = image.height;
        const pixels2DContext = createCanvasContext(canvas);
        if (pixels2DContext != null) {
          const height = image.height;
          const width = image.width;
          pixels2DContext.drawImage(image, 0, 0, width, height);
          data = pixels2DContext.getImageData(0, 0, width, height).data;
          bufferToTensorOptions.height = height;
          bufferToTensorOptions.width = width;
          return (0, exports.bufferToTensor)(data, bufferToTensorOptions);
        } else {
          throw new Error("Can not access image data");
        }
      } else if (isString) {
        return new Promise((resolve, reject) => {
          const canvas = createCanvas();
          const context = createCanvasContext(canvas);
          if (!image || !context) {
            return reject();
          }
          const newImage = new Image();
          newImage.crossOrigin = "Anonymous";
          newImage.src = image;
          newImage.onload = () => {
            canvas.width = newImage.width;
            canvas.height = newImage.height;
            context.drawImage(newImage, 0, 0, canvas.width, canvas.height);
            const img = context.getImageData(0, 0, canvas.width, canvas.height);
            bufferToTensorOptions.height = canvas.height;
            bufferToTensorOptions.width = canvas.width;
            resolve((0, exports.bufferToTensor)(img.data, bufferToTensorOptions));
          };
        });
      } else {
        throw new Error("Input data provided is not supported - aborted tensor creation");
      }
      if (data !== void 0) {
        return (0, exports.bufferToTensor)(data, bufferToTensorOptions);
      } else {
        throw new Error("Input data provided is not supported - aborted tensor creation");
      }
    };
    exports.tensorFromImage = tensorFromImage;
    var tensorFromTexture = (texture, options) => {
      const { width, height, download, dispose } = options;
      const dims = [1, height, width, 4];
      return new tensor_impl_js_1.Tensor({ location: "texture", type: "float32", texture, dims, download, dispose });
    };
    exports.tensorFromTexture = tensorFromTexture;
    var tensorFromGpuBuffer = (gpuBuffer, options) => {
      const { dataType, dims, download, dispose } = options;
      return new tensor_impl_js_1.Tensor({ location: "gpu-buffer", type: dataType ?? "float32", gpuBuffer, dims, download, dispose });
    };
    exports.tensorFromGpuBuffer = tensorFromGpuBuffer;
    var tensorFromMLTensor = (mlTensor, options) => {
      const { dataType, dims, download, dispose } = options;
      return new tensor_impl_js_1.Tensor({ location: "ml-tensor", type: dataType ?? "float32", mlTensor, dims, download, dispose });
    };
    exports.tensorFromMLTensor = tensorFromMLTensor;
    var tensorFromPinnedBuffer = (type, buffer, dims) => new tensor_impl_js_1.Tensor({ location: "cpu-pinned", type, data: buffer, dims: dims ?? [buffer.length] });
    exports.tensorFromPinnedBuffer = tensorFromPinnedBuffer;
  }
});

// node_modules/onnxruntime-common/dist/cjs/tensor-impl-type-mapping.js
var require_tensor_impl_type_mapping = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/tensor-impl-type-mapping.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.checkTypedArray = exports.NUMERIC_TENSOR_TYPEDARRAY_TO_TYPE_MAP = exports.NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP = void 0;
    exports.NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP = /* @__PURE__ */ new Map([
      ["float32", Float32Array],
      ["uint8", Uint8Array],
      ["int8", Int8Array],
      ["uint16", Uint16Array],
      ["int16", Int16Array],
      ["int32", Int32Array],
      ["bool", Uint8Array],
      ["float64", Float64Array],
      ["uint32", Uint32Array],
      ["int4", Uint8Array],
      ["uint4", Uint8Array]
    ]);
    exports.NUMERIC_TENSOR_TYPEDARRAY_TO_TYPE_MAP = /* @__PURE__ */ new Map([
      [Float32Array, "float32"],
      [Uint8Array, "uint8"],
      [Int8Array, "int8"],
      [Uint16Array, "uint16"],
      [Int16Array, "int16"],
      [Int32Array, "int32"],
      [Float64Array, "float64"],
      [Uint32Array, "uint32"]
    ]);
    var isTypedArrayChecked = false;
    var checkTypedArray = () => {
      if (!isTypedArrayChecked) {
        isTypedArrayChecked = true;
        const isBigInt64ArrayAvailable = typeof BigInt64Array !== "undefined" && BigInt64Array.from;
        const isBigUint64ArrayAvailable = typeof BigUint64Array !== "undefined" && BigUint64Array.from;
        const Float16Array = globalThis.Float16Array;
        const isFloat16ArrayAvailable = typeof Float16Array !== "undefined" && Float16Array.from;
        if (isBigInt64ArrayAvailable) {
          exports.NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP.set("int64", BigInt64Array);
          exports.NUMERIC_TENSOR_TYPEDARRAY_TO_TYPE_MAP.set(BigInt64Array, "int64");
        }
        if (isBigUint64ArrayAvailable) {
          exports.NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP.set("uint64", BigUint64Array);
          exports.NUMERIC_TENSOR_TYPEDARRAY_TO_TYPE_MAP.set(BigUint64Array, "uint64");
        }
        if (isFloat16ArrayAvailable) {
          exports.NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP.set("float16", Float16Array);
          exports.NUMERIC_TENSOR_TYPEDARRAY_TO_TYPE_MAP.set(Float16Array, "float16");
        } else {
          exports.NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP.set("float16", Uint16Array);
        }
      }
    };
    exports.checkTypedArray = checkTypedArray;
  }
});

// node_modules/onnxruntime-common/dist/cjs/tensor-utils-impl.js
var require_tensor_utils_impl = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/tensor-utils-impl.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.tensorReshape = exports.calculateSize = void 0;
    var tensor_impl_js_1 = require_tensor_impl();
    var calculateSize = (dims) => {
      let size = 1;
      for (let i = 0; i < dims.length; i++) {
        const dim = dims[i];
        if (typeof dim !== "number" || !Number.isSafeInteger(dim)) {
          throw new TypeError(`dims[${i}] must be an integer, got: ${dim}`);
        }
        if (dim < 0) {
          throw new RangeError(`dims[${i}] must be a non-negative integer, got: ${dim}`);
        }
        size *= dim;
      }
      return size;
    };
    exports.calculateSize = calculateSize;
    var tensorReshape = (tensor, dims) => {
      switch (tensor.location) {
        case "cpu":
          return new tensor_impl_js_1.Tensor(tensor.type, tensor.data, dims);
        case "cpu-pinned":
          return new tensor_impl_js_1.Tensor({
            location: "cpu-pinned",
            data: tensor.data,
            type: tensor.type,
            dims
          });
        case "texture":
          return new tensor_impl_js_1.Tensor({
            location: "texture",
            texture: tensor.texture,
            type: tensor.type,
            dims
          });
        case "gpu-buffer":
          return new tensor_impl_js_1.Tensor({
            location: "gpu-buffer",
            gpuBuffer: tensor.gpuBuffer,
            type: tensor.type,
            dims
          });
        case "ml-tensor":
          return new tensor_impl_js_1.Tensor({
            location: "ml-tensor",
            mlTensor: tensor.mlTensor,
            type: tensor.type,
            dims
          });
        default:
          throw new Error(`tensorReshape: tensor location ${tensor.location} is not supported`);
      }
    };
    exports.tensorReshape = tensorReshape;
  }
});

// node_modules/onnxruntime-common/dist/cjs/tensor-impl.js
var require_tensor_impl = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/tensor-impl.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Tensor = void 0;
    var tensor_conversion_impl_js_1 = require_tensor_conversion_impl();
    var tensor_factory_impl_js_1 = require_tensor_factory_impl();
    var tensor_impl_type_mapping_js_1 = require_tensor_impl_type_mapping();
    var tensor_utils_impl_js_1 = require_tensor_utils_impl();
    var Tensor = class {
      /**
       * implementation.
       */
      constructor(arg0, arg1, arg2) {
        (0, tensor_impl_type_mapping_js_1.checkTypedArray)();
        let type;
        let dims;
        if (typeof arg0 === "object" && "location" in arg0) {
          this.dataLocation = arg0.location;
          type = arg0.type;
          dims = arg0.dims;
          switch (arg0.location) {
            case "cpu-pinned": {
              const expectedTypedArrayConstructor = tensor_impl_type_mapping_js_1.NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP.get(type);
              if (!expectedTypedArrayConstructor) {
                throw new TypeError(`unsupported type "${type}" to create tensor from pinned buffer`);
              }
              if (!(arg0.data instanceof expectedTypedArrayConstructor)) {
                throw new TypeError(`buffer should be of type ${expectedTypedArrayConstructor.name}`);
              }
              this.cpuData = arg0.data;
              break;
            }
            case "texture": {
              if (type !== "float32") {
                throw new TypeError(`unsupported type "${type}" to create tensor from texture`);
              }
              this.gpuTextureData = arg0.texture;
              this.downloader = arg0.download;
              this.disposer = arg0.dispose;
              break;
            }
            case "gpu-buffer": {
              if (type !== "float32" && type !== "float16" && type !== "int32" && type !== "int64" && type !== "uint32" && type !== "uint8" && type !== "bool" && type !== "uint4" && type !== "int4") {
                throw new TypeError(`unsupported type "${type}" to create tensor from gpu buffer`);
              }
              this.gpuBufferData = arg0.gpuBuffer;
              this.downloader = arg0.download;
              this.disposer = arg0.dispose;
              break;
            }
            case "ml-tensor": {
              if (type !== "float32" && type !== "float16" && type !== "int32" && type !== "int64" && type !== "uint32" && type !== "uint64" && type !== "int8" && type !== "uint8" && type !== "bool" && type !== "uint4" && type !== "int4") {
                throw new TypeError(`unsupported type "${type}" to create tensor from MLTensor`);
              }
              this.mlTensorData = arg0.mlTensor;
              this.downloader = arg0.download;
              this.disposer = arg0.dispose;
              break;
            }
            default:
              throw new Error(`Tensor constructor: unsupported location '${this.dataLocation}'`);
          }
        } else {
          let data;
          let maybeDims;
          if (typeof arg0 === "string") {
            type = arg0;
            maybeDims = arg2;
            if (arg0 === "string") {
              if (!Array.isArray(arg1)) {
                throw new TypeError("A string tensor's data must be a string array.");
              }
              data = arg1;
            } else {
              const typedArrayConstructor = tensor_impl_type_mapping_js_1.NUMERIC_TENSOR_TYPE_TO_TYPEDARRAY_MAP.get(arg0);
              if (typedArrayConstructor === void 0) {
                throw new TypeError(`Unsupported tensor type: ${arg0}.`);
              }
              if (Array.isArray(arg1)) {
                if (arg0 === "float16" && typedArrayConstructor === Uint16Array || arg0 === "uint4" || arg0 === "int4") {
                  throw new TypeError(`Creating a ${arg0} tensor from number array is not supported. Please use ${typedArrayConstructor.name} as data.`);
                } else if (arg0 === "uint64" || arg0 === "int64") {
                  data = typedArrayConstructor.from(arg1, BigInt);
                } else {
                  data = typedArrayConstructor.from(arg1);
                }
              } else if (arg1 instanceof typedArrayConstructor) {
                data = arg1;
              } else if (arg1 instanceof Uint8ClampedArray) {
                if (arg0 === "uint8") {
                  data = Uint8Array.from(arg1);
                } else {
                  throw new TypeError(`A Uint8ClampedArray tensor's data must be type of uint8`);
                }
              } else if (arg0 === "float16" && arg1 instanceof Uint16Array && typedArrayConstructor !== Uint16Array) {
                data = new globalThis.Float16Array(arg1.buffer, arg1.byteOffset, arg1.length);
              } else {
                throw new TypeError(`A ${type} tensor's data must be type of ${typedArrayConstructor}`);
              }
            }
          } else {
            maybeDims = arg1;
            if (Array.isArray(arg0)) {
              if (arg0.length === 0) {
                throw new TypeError("Tensor type cannot be inferred from an empty array.");
              }
              const firstElementType = typeof arg0[0];
              if (firstElementType === "string") {
                type = "string";
                data = arg0;
              } else if (firstElementType === "boolean") {
                type = "bool";
                data = Uint8Array.from(arg0);
              } else {
                throw new TypeError(`Invalid element type of data array: ${firstElementType}.`);
              }
            } else if (arg0 instanceof Uint8ClampedArray) {
              type = "uint8";
              data = Uint8Array.from(arg0);
            } else {
              const mappedType = tensor_impl_type_mapping_js_1.NUMERIC_TENSOR_TYPEDARRAY_TO_TYPE_MAP.get(arg0.constructor);
              if (mappedType === void 0) {
                throw new TypeError(`Unsupported type for tensor data: ${arg0.constructor}.`);
              }
              type = mappedType;
              data = arg0;
            }
          }
          if (maybeDims === void 0) {
            maybeDims = [data.length];
          } else if (!Array.isArray(maybeDims)) {
            throw new TypeError("A tensor's dims must be a number array");
          }
          dims = maybeDims;
          this.cpuData = data;
          this.dataLocation = "cpu";
        }
        const size = (0, tensor_utils_impl_js_1.calculateSize)(dims);
        if (this.cpuData && size !== this.cpuData.length) {
          if ((type === "uint4" || type === "int4") && Math.ceil(size / 2) === this.cpuData.length) {
          } else {
            throw new Error(`Tensor's size(${size}) does not match data length(${this.cpuData.length}).`);
          }
        }
        this.type = type;
        this.dims = dims;
        this.size = size;
      }
      // #endregion
      // #region factory
      static async fromImage(image, options) {
        return (0, tensor_factory_impl_js_1.tensorFromImage)(image, options);
      }
      static fromTexture(texture, options) {
        return (0, tensor_factory_impl_js_1.tensorFromTexture)(texture, options);
      }
      static fromGpuBuffer(gpuBuffer, options) {
        return (0, tensor_factory_impl_js_1.tensorFromGpuBuffer)(gpuBuffer, options);
      }
      static fromMLTensor(mlTensor, options) {
        return (0, tensor_factory_impl_js_1.tensorFromMLTensor)(mlTensor, options);
      }
      static fromPinnedBuffer(type, buffer, dims) {
        return (0, tensor_factory_impl_js_1.tensorFromPinnedBuffer)(type, buffer, dims);
      }
      // #endregion
      // #region conversions
      toDataURL(options) {
        return (0, tensor_conversion_impl_js_1.tensorToDataURL)(this, options);
      }
      toImageData(options) {
        return (0, tensor_conversion_impl_js_1.tensorToImageData)(this, options);
      }
      // #endregion
      // #region properties
      get data() {
        this.ensureValid();
        if (!this.cpuData) {
          throw new Error("The data is not on CPU. Use `getData()` to download GPU data to CPU, or use `texture` or `gpuBuffer` property to access the GPU data directly.");
        }
        return this.cpuData;
      }
      get location() {
        return this.dataLocation;
      }
      get texture() {
        this.ensureValid();
        if (!this.gpuTextureData) {
          throw new Error("The data is not stored as a WebGL texture.");
        }
        return this.gpuTextureData;
      }
      get gpuBuffer() {
        this.ensureValid();
        if (!this.gpuBufferData) {
          throw new Error("The data is not stored as a WebGPU buffer.");
        }
        return this.gpuBufferData;
      }
      get mlTensor() {
        this.ensureValid();
        if (!this.mlTensorData) {
          throw new Error("The data is not stored as a WebNN MLTensor.");
        }
        return this.mlTensorData;
      }
      // #endregion
      // #region methods
      async getData(releaseData) {
        this.ensureValid();
        switch (this.dataLocation) {
          case "cpu":
          case "cpu-pinned":
            return this.data;
          case "texture":
          case "gpu-buffer":
          case "ml-tensor": {
            if (!this.downloader) {
              throw new Error("The current tensor is not created with a specified data downloader.");
            }
            if (this.isDownloading) {
              throw new Error("The current tensor is being downloaded.");
            }
            try {
              this.isDownloading = true;
              const data = await this.downloader();
              this.downloader = void 0;
              this.dataLocation = "cpu";
              this.cpuData = data;
              if (releaseData && this.disposer) {
                this.disposer();
                this.disposer = void 0;
              }
              return data;
            } finally {
              this.isDownloading = false;
            }
          }
          default:
            throw new Error(`cannot get data from location: ${this.dataLocation}`);
        }
      }
      dispose() {
        if (this.isDownloading) {
          throw new Error("The current tensor is being downloaded.");
        }
        if (this.disposer) {
          this.disposer();
          this.disposer = void 0;
        }
        this.cpuData = void 0;
        this.gpuTextureData = void 0;
        this.gpuBufferData = void 0;
        this.mlTensorData = void 0;
        this.downloader = void 0;
        this.isDownloading = void 0;
        this.dataLocation = "none";
      }
      // #endregion
      // #region tensor utilities
      ensureValid() {
        if (this.dataLocation === "none") {
          throw new Error("The tensor is disposed.");
        }
      }
      reshape(dims) {
        this.ensureValid();
        if (this.downloader || this.disposer) {
          throw new Error("Cannot reshape a tensor that owns GPU resource.");
        }
        return (0, tensor_utils_impl_js_1.tensorReshape)(this, dims);
      }
    };
    exports.Tensor = Tensor;
  }
});

// node_modules/onnxruntime-common/dist/cjs/tensor.js
var require_tensor = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/tensor.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.Tensor = void 0;
    var tensor_impl_js_1 = require_tensor_impl();
    exports.Tensor = tensor_impl_js_1.Tensor;
  }
});

// node_modules/onnxruntime-common/dist/cjs/trace.js
var require_trace = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/trace.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.TRACE_EVENT_END = exports.TRACE_EVENT_BEGIN = exports.TRACE_FUNC_END = exports.TRACE_FUNC_BEGIN = exports.TRACE = void 0;
    var env_impl_js_1 = require_env_impl();
    var TRACE = (deviceType, label) => {
      if (typeof env_impl_js_1.env.trace === "undefined" ? !env_impl_js_1.env.wasm.trace : !env_impl_js_1.env.trace) {
        return;
      }
      console.timeStamp(`${deviceType}::ORT::${label}`);
    };
    exports.TRACE = TRACE;
    var TRACE_FUNC = (msg, extraMsg) => {
      const stack = new Error().stack?.split(/\r\n|\r|\n/g) || [];
      let hasTraceFunc = false;
      for (let i = 0; i < stack.length; i++) {
        if (hasTraceFunc && !stack[i].includes("TRACE_FUNC")) {
          let label = `FUNC_${msg}::${stack[i].trim().split(" ")[1]}`;
          if (extraMsg) {
            label += `::${extraMsg}`;
          }
          (0, exports.TRACE)("CPU", label);
          return;
        }
        if (stack[i].includes("TRACE_FUNC")) {
          hasTraceFunc = true;
        }
      }
    };
    var TRACE_FUNC_BEGIN = (extraMsg) => {
      if (typeof env_impl_js_1.env.trace === "undefined" ? !env_impl_js_1.env.wasm.trace : !env_impl_js_1.env.trace) {
        return;
      }
      TRACE_FUNC("BEGIN", extraMsg);
    };
    exports.TRACE_FUNC_BEGIN = TRACE_FUNC_BEGIN;
    var TRACE_FUNC_END = (extraMsg) => {
      if (typeof env_impl_js_1.env.trace === "undefined" ? !env_impl_js_1.env.wasm.trace : !env_impl_js_1.env.trace) {
        return;
      }
      TRACE_FUNC("END", extraMsg);
    };
    exports.TRACE_FUNC_END = TRACE_FUNC_END;
    var TRACE_EVENT_BEGIN = (extraMsg) => {
      if (typeof env_impl_js_1.env.trace === "undefined" ? !env_impl_js_1.env.wasm.trace : !env_impl_js_1.env.trace) {
        return;
      }
      console.time(`ORT::${extraMsg}`);
    };
    exports.TRACE_EVENT_BEGIN = TRACE_EVENT_BEGIN;
    var TRACE_EVENT_END = (extraMsg) => {
      if (typeof env_impl_js_1.env.trace === "undefined" ? !env_impl_js_1.env.wasm.trace : !env_impl_js_1.env.trace) {
        return;
      }
      console.timeEnd(`ORT::${extraMsg}`);
    };
    exports.TRACE_EVENT_END = TRACE_EVENT_END;
  }
});

// node_modules/onnxruntime-common/dist/cjs/inference-session-impl.js
var require_inference_session_impl = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/inference-session-impl.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.InferenceSession = void 0;
    var backend_impl_js_1 = require_backend_impl();
    var tensor_js_1 = require_tensor();
    var trace_js_1 = require_trace();
    var InferenceSession = class _InferenceSession {
      constructor(handler) {
        this.handler = handler;
      }
      async run(feeds, arg1, arg2) {
        (0, trace_js_1.TRACE_FUNC_BEGIN)();
        (0, trace_js_1.TRACE_EVENT_BEGIN)("InferenceSession.run");
        const fetches = {};
        let options = {};
        if (typeof feeds !== "object" || feeds === null || feeds instanceof tensor_js_1.Tensor || Array.isArray(feeds)) {
          throw new TypeError("'feeds' must be an object that use input names as keys and OnnxValue as corresponding values.");
        }
        let isFetchesEmpty = true;
        if (typeof arg1 === "object") {
          if (arg1 === null) {
            throw new TypeError("Unexpected argument[1]: cannot be null.");
          }
          if (arg1 instanceof tensor_js_1.Tensor) {
            throw new TypeError("'fetches' cannot be a Tensor");
          }
          if (Array.isArray(arg1)) {
            if (arg1.length === 0) {
              throw new TypeError("'fetches' cannot be an empty array.");
            }
            isFetchesEmpty = false;
            for (const name of arg1) {
              if (typeof name !== "string") {
                throw new TypeError("'fetches' must be a string array or an object.");
              }
              if (this.outputNames.indexOf(name) === -1) {
                throw new RangeError(`'fetches' contains invalid output name: ${name}.`);
              }
              fetches[name] = null;
            }
            if (typeof arg2 === "object" && arg2 !== null) {
              options = arg2;
            } else if (typeof arg2 !== "undefined") {
              throw new TypeError("'options' must be an object.");
            }
          } else {
            let isFetches = false;
            const arg1Keys = Object.getOwnPropertyNames(arg1);
            for (const name of this.outputNames) {
              if (arg1Keys.indexOf(name) !== -1) {
                const v = arg1[name];
                if (v === null || v instanceof tensor_js_1.Tensor) {
                  isFetches = true;
                  isFetchesEmpty = false;
                  fetches[name] = v;
                }
              }
            }
            if (isFetches) {
              if (typeof arg2 === "object" && arg2 !== null) {
                options = arg2;
              } else if (typeof arg2 !== "undefined") {
                throw new TypeError("'options' must be an object.");
              }
            } else {
              options = arg1;
            }
          }
        } else if (typeof arg1 !== "undefined") {
          throw new TypeError("Unexpected argument[1]: must be 'fetches' or 'options'.");
        }
        for (const name of this.inputNames) {
          if (typeof feeds[name] === "undefined") {
            throw new Error(`input '${name}' is missing in 'feeds'.`);
          }
        }
        if (isFetchesEmpty) {
          for (const name of this.outputNames) {
            fetches[name] = null;
          }
        }
        const results = await this.handler.run(feeds, fetches, options);
        const returnValue = {};
        for (const key in results) {
          if (Object.hasOwnProperty.call(results, key)) {
            const result = results[key];
            if (result instanceof tensor_js_1.Tensor) {
              returnValue[key] = result;
            } else {
              returnValue[key] = new tensor_js_1.Tensor(result.type, result.data, result.dims);
            }
          }
        }
        (0, trace_js_1.TRACE_EVENT_END)("InferenceSession.run");
        (0, trace_js_1.TRACE_FUNC_END)();
        return returnValue;
      }
      async release() {
        return this.handler.dispose();
      }
      static async create(arg0, arg1, arg2, arg3) {
        (0, trace_js_1.TRACE_FUNC_BEGIN)();
        (0, trace_js_1.TRACE_EVENT_BEGIN)("InferenceSession.create");
        let filePathOrUint8Array;
        let options = {};
        if (typeof arg0 === "string") {
          filePathOrUint8Array = arg0;
          if (typeof arg1 === "object" && arg1 !== null) {
            options = arg1;
          } else if (typeof arg1 !== "undefined") {
            throw new TypeError("'options' must be an object.");
          }
        } else if (arg0 instanceof Uint8Array) {
          filePathOrUint8Array = arg0;
          if (typeof arg1 === "object" && arg1 !== null) {
            options = arg1;
          } else if (typeof arg1 !== "undefined") {
            throw new TypeError("'options' must be an object.");
          }
        } else if (arg0 instanceof ArrayBuffer || typeof SharedArrayBuffer !== "undefined" && arg0 instanceof SharedArrayBuffer) {
          const buffer = arg0;
          let byteOffset = 0;
          let byteLength = arg0.byteLength;
          if (typeof arg1 === "object" && arg1 !== null) {
            options = arg1;
          } else if (typeof arg1 === "number") {
            byteOffset = arg1;
            if (!Number.isSafeInteger(byteOffset)) {
              throw new RangeError("'byteOffset' must be an integer.");
            }
            if (byteOffset < 0 || byteOffset >= buffer.byteLength) {
              throw new RangeError(`'byteOffset' is out of range [0, ${buffer.byteLength}).`);
            }
            byteLength = arg0.byteLength - byteOffset;
            if (typeof arg2 === "number") {
              byteLength = arg2;
              if (!Number.isSafeInteger(byteLength)) {
                throw new RangeError("'byteLength' must be an integer.");
              }
              if (byteLength <= 0 || byteOffset + byteLength > buffer.byteLength) {
                throw new RangeError(`'byteLength' is out of range (0, ${buffer.byteLength - byteOffset}].`);
              }
              if (typeof arg3 === "object" && arg3 !== null) {
                options = arg3;
              } else if (typeof arg3 !== "undefined") {
                throw new TypeError("'options' must be an object.");
              }
            } else if (typeof arg2 !== "undefined") {
              throw new TypeError("'byteLength' must be a number.");
            }
          } else if (typeof arg1 !== "undefined") {
            throw new TypeError("'options' must be an object.");
          }
          filePathOrUint8Array = new Uint8Array(buffer, byteOffset, byteLength);
        } else {
          throw new TypeError("Unexpected argument[0]: must be 'path' or 'buffer'.");
        }
        const [backend, optionsWithValidatedEPs] = await (0, backend_impl_js_1.resolveBackendAndExecutionProviders)(options);
        const handler = await backend.createInferenceSessionHandler(filePathOrUint8Array, optionsWithValidatedEPs);
        (0, trace_js_1.TRACE_EVENT_END)("InferenceSession.create");
        (0, trace_js_1.TRACE_FUNC_END)();
        return new _InferenceSession(handler);
      }
      startProfiling() {
        this.handler.startProfiling();
      }
      endProfiling() {
        this.handler.endProfiling();
      }
      get inputNames() {
        return this.handler.inputNames;
      }
      get outputNames() {
        return this.handler.outputNames;
      }
      get inputMetadata() {
        return this.handler.inputMetadata;
      }
      get outputMetadata() {
        return this.handler.outputMetadata;
      }
    };
    exports.InferenceSession = InferenceSession;
  }
});

// node_modules/onnxruntime-common/dist/cjs/inference-session.js
var require_inference_session = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/inference-session.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.InferenceSession = void 0;
    var inference_session_impl_js_1 = require_inference_session_impl();
    exports.InferenceSession = inference_session_impl_js_1.InferenceSession;
  }
});

// node_modules/onnxruntime-common/dist/cjs/tensor-conversion.js
var require_tensor_conversion = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/tensor-conversion.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/onnxruntime-common/dist/cjs/tensor-factory.js
var require_tensor_factory = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/tensor-factory.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/onnxruntime-common/dist/cjs/onnx-model.js
var require_onnx_model = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/onnx-model.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/onnxruntime-common/dist/cjs/onnx-value.js
var require_onnx_value = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/onnx-value.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
  }
});

// node_modules/onnxruntime-common/dist/cjs/index.js
var require_cjs = __commonJS({
  "node_modules/onnxruntime-common/dist/cjs/index.js"(exports) {
    "use strict";
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports && exports.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    __exportStar(require_backend(), exports);
    __exportStar(require_env(), exports);
    __exportStar(require_inference_session(), exports);
    __exportStar(require_tensor(), exports);
    __exportStar(require_tensor_conversion(), exports);
    __exportStar(require_tensor_factory(), exports);
    __exportStar(require_trace(), exports);
    __exportStar(require_onnx_model(), exports);
    __exportStar(require_onnx_value(), exports);
  }
});

// node_modules/onnxruntime-node/bin/napi-v6/darwin/arm64/onnxruntime_binding.node
var require_onnxruntime_binding = __commonJS({
  "node_modules/onnxruntime-node/bin/napi-v6/darwin/arm64/onnxruntime_binding.node"(exports, module) {
    module.exports = "./onnxruntime_binding-CCRPY4IE.node";
  }
});

// node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/onnxruntime_binding.node
var require_onnxruntime_binding2 = __commonJS({
  "node_modules/onnxruntime-node/bin/napi-v6/linux/arm64/onnxruntime_binding.node"(exports, module) {
    module.exports = "./onnxruntime_binding-6BJUDC4G.node";
  }
});

// node_modules/onnxruntime-node/bin/napi-v6/linux/x64/onnxruntime_binding.node
var require_onnxruntime_binding3 = __commonJS({
  "node_modules/onnxruntime-node/bin/napi-v6/linux/x64/onnxruntime_binding.node"(exports, module) {
    module.exports = "./onnxruntime_binding-GX3BHPXL.node";
  }
});

// node_modules/onnxruntime-node/bin/napi-v6/win32/arm64/onnxruntime_binding.node
var require_onnxruntime_binding4 = __commonJS({
  "node_modules/onnxruntime-node/bin/napi-v6/win32/arm64/onnxruntime_binding.node"(exports, module) {
    module.exports = "./onnxruntime_binding-THHZGQ6U.node";
  }
});

// node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime_binding.node
var require_onnxruntime_binding5 = __commonJS({
  "node_modules/onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime_binding.node"(exports, module) {
    module.exports = "./onnxruntime_binding-QRPP74L7.node";
  }
});

// require("../bin/napi-v6/**/*/**/*/onnxruntime_binding.node") in node_modules/onnxruntime-node/dist/binding.js
var globRequire_bin_napi_v6_onnxruntime_binding_node;
var init_ = __esm({
  'require("../bin/napi-v6/**/*/**/*/onnxruntime_binding.node") in node_modules/onnxruntime-node/dist/binding.js'() {
    globRequire_bin_napi_v6_onnxruntime_binding_node = __glob({
      "../bin/napi-v6/darwin/arm64/onnxruntime_binding.node": () => require_onnxruntime_binding(),
      "../bin/napi-v6/linux/arm64/onnxruntime_binding.node": () => require_onnxruntime_binding2(),
      "../bin/napi-v6/linux/x64/onnxruntime_binding.node": () => require_onnxruntime_binding3(),
      "../bin/napi-v6/win32/arm64/onnxruntime_binding.node": () => require_onnxruntime_binding4(),
      "../bin/napi-v6/win32/x64/onnxruntime_binding.node": () => require_onnxruntime_binding5()
    });
  }
});

// node_modules/onnxruntime-node/dist/binding.js
var require_binding = __commonJS({
  "node_modules/onnxruntime-node/dist/binding.js"(exports) {
    "use strict";
    init_();
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.initOrt = exports.binding = void 0;
    var worker_threads_1 = __require("worker_threads");
    var onnxruntime_common_1 = require_cjs();
    exports.binding = globRequire_bin_napi_v6_onnxruntime_binding_node(`../bin/napi-v6/${process.platform}/${process.arch}/onnxruntime_binding.node`);
    var ortInitialized = false;
    var initOrt = () => {
      if (!ortInitialized) {
        ortInitialized = true;
        let logLevel = 2;
        if (onnxruntime_common_1.env.logLevel) {
          switch (onnxruntime_common_1.env.logLevel) {
            case "verbose":
              logLevel = 0;
              break;
            case "info":
              logLevel = 1;
              break;
            case "warning":
              logLevel = 2;
              break;
            case "error":
              logLevel = 3;
              break;
            case "fatal":
              logLevel = 4;
              break;
            default:
              throw new Error(`Unsupported log level: ${onnxruntime_common_1.env.logLevel}`);
          }
        }
        exports.binding.initOrtOnce(logLevel, onnxruntime_common_1.Tensor, worker_threads_1.isMainThread);
      }
    };
    exports.initOrt = initOrt;
  }
});

// node_modules/onnxruntime-node/dist/backend.js
var require_backend2 = __commonJS({
  "node_modules/onnxruntime-node/dist/backend.js"(exports) {
    "use strict";
    var __classPrivateFieldSet = exports && exports.__classPrivateFieldSet || function(receiver, state, value, kind, f) {
      if (kind === "m") throw new TypeError("Private method is not writable");
      if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
      if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
      return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
    };
    var __classPrivateFieldGet = exports && exports.__classPrivateFieldGet || function(receiver, state, kind, f) {
      if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
      if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
      return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
    };
    var _OnnxruntimeSessionHandler_inferenceSession;
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.listSupportedBackends = exports.onnxruntimeBackend = void 0;
    var binding_1 = require_binding();
    var dataTypeStrings = [
      void 0,
      // 0
      "float32",
      "uint8",
      "int8",
      "uint16",
      "int16",
      "int32",
      "int64",
      "string",
      "bool",
      "float16",
      "float64",
      "uint32",
      "uint64",
      void 0,
      // 14
      void 0,
      // 15
      void 0,
      // 16
      void 0,
      // 17
      void 0,
      // 18
      void 0,
      // 19
      void 0,
      // 20
      "uint4",
      "int4"
    ];
    var OnnxruntimeSessionHandler = class {
      constructor(pathOrBuffer, options) {
        _OnnxruntimeSessionHandler_inferenceSession.set(this, void 0);
        (0, binding_1.initOrt)();
        __classPrivateFieldSet(this, _OnnxruntimeSessionHandler_inferenceSession, new binding_1.binding.InferenceSession(), "f");
        if (typeof pathOrBuffer === "string") {
          __classPrivateFieldGet(this, _OnnxruntimeSessionHandler_inferenceSession, "f").loadModel(pathOrBuffer, options);
        } else {
          __classPrivateFieldGet(this, _OnnxruntimeSessionHandler_inferenceSession, "f").loadModel(pathOrBuffer.buffer, pathOrBuffer.byteOffset, pathOrBuffer.byteLength, options);
        }
        this.inputNames = [];
        this.outputNames = [];
        this.inputMetadata = [];
        this.outputMetadata = [];
        const fillNamesAndMetadata = (rawMetadata) => {
          const names = [];
          const metadata = [];
          for (const m of rawMetadata) {
            names.push(m.name);
            if (!m.isTensor) {
              metadata.push({ name: m.name, isTensor: false });
            } else {
              const type = dataTypeStrings[m.type];
              if (type === void 0) {
                throw new Error(`Unsupported data type: ${m.type}`);
              }
              const shape = [];
              for (let i = 0; i < m.shape.length; ++i) {
                const dim = m.shape[i];
                if (dim === -1) {
                  shape.push(m.symbolicDimensions[i]);
                } else if (dim >= 0) {
                  shape.push(dim);
                } else {
                  throw new Error(`Invalid dimension: ${dim}`);
                }
              }
              metadata.push({
                name: m.name,
                isTensor: m.isTensor,
                type,
                shape
              });
            }
          }
          return [names, metadata];
        };
        [this.inputNames, this.inputMetadata] = fillNamesAndMetadata(__classPrivateFieldGet(this, _OnnxruntimeSessionHandler_inferenceSession, "f").inputMetadata);
        [this.outputNames, this.outputMetadata] = fillNamesAndMetadata(__classPrivateFieldGet(this, _OnnxruntimeSessionHandler_inferenceSession, "f").outputMetadata);
      }
      async dispose() {
        __classPrivateFieldGet(this, _OnnxruntimeSessionHandler_inferenceSession, "f").dispose();
      }
      startProfiling() {
      }
      endProfiling() {
        __classPrivateFieldGet(this, _OnnxruntimeSessionHandler_inferenceSession, "f").endProfiling();
      }
      async run(feeds, fetches, options) {
        return new Promise((resolve, reject) => {
          setImmediate(() => {
            try {
              resolve(__classPrivateFieldGet(this, _OnnxruntimeSessionHandler_inferenceSession, "f").run(feeds, fetches, options));
            } catch (e) {
              reject(e);
            }
          });
        });
      }
    };
    _OnnxruntimeSessionHandler_inferenceSession = /* @__PURE__ */ new WeakMap();
    var OnnxruntimeBackend = class {
      async init() {
        return Promise.resolve();
      }
      async createInferenceSessionHandler(pathOrBuffer, options) {
        return new Promise((resolve, reject) => {
          setImmediate(() => {
            try {
              resolve(new OnnxruntimeSessionHandler(pathOrBuffer, options || {}));
            } catch (e) {
              reject(e);
            }
          });
        });
      }
    };
    exports.onnxruntimeBackend = new OnnxruntimeBackend();
    exports.listSupportedBackends = binding_1.binding.listSupportedBackends;
  }
});

// node_modules/onnxruntime-node/dist/version.js
var require_version2 = __commonJS({
  "node_modules/onnxruntime-node/dist/version.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.version = void 0;
    exports.version = "1.30.0";
  }
});

// node_modules/onnxruntime-node/dist/index.js
var require_dist = __commonJS({
  "node_modules/onnxruntime-node/dist/index.js"(exports) {
    var __createBinding = exports && exports.__createBinding || (Object.create ? (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      var desc = Object.getOwnPropertyDescriptor(m, k);
      if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
        desc = { enumerable: true, get: function() {
          return m[k];
        } };
      }
      Object.defineProperty(o, k2, desc);
    }) : (function(o, m, k, k2) {
      if (k2 === void 0) k2 = k;
      o[k2] = m[k];
    }));
    var __exportStar = exports && exports.__exportStar || function(m, exports2) {
      for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports2, p)) __createBinding(exports2, m, p);
    };
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.listSupportedBackends = void 0;
    __exportStar(require_cjs(), exports);
    var backend_1 = require_backend2();
    Object.defineProperty(exports, "listSupportedBackends", { enumerable: true, get: function() {
      return backend_1.listSupportedBackends;
    } });
    var onnxruntime_common_1 = require_cjs();
    var version_1 = require_version2();
    var backend_2 = require_backend2();
    var backends = (0, backend_2.listSupportedBackends)();
    for (const backend of backends) {
      (0, onnxruntime_common_1.registerBackend)(backend.name, backend_2.onnxruntimeBackend, 100);
    }
    Object.defineProperty(onnxruntime_common_1.env.versions, "node", { value: version_1.version, enumerable: true });
  }
});
export default require_dist();
