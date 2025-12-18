// Edge TTS API Proxy - Minimal Version with Test UI

const TOKEN_REFRESH_BEFORE_EXPIRY = 5 * 60;
const OPENAI_VOICE_MAP = {
  shimmer: "zh-CN-XiaoxiaoNeural",
  alloy: "zh-CN-YunyangNeural",
  fable: "zh-CN-YunjianNeural",
  onyx: "zh-CN-XiaoyiNeural",
  nova: "zh-CN-YunxiNeural",
  echo: "zh-CN-liaoning-XiaobeiNeural",
};

let tokenInfo = { endpoint: null, token: null, expiredAt: null };

function generateUserIdFromDomain(requestUrl) {
  try {
    var url = new URL(requestUrl);
    var domain = url.hostname;
    var hash = 0;
    for (var i = 0; i < domain.length; i++) {
      hash = (hash << 5) - hash + domain.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, "0") + Math.abs(hash * 31).toString(16).padStart(8, "0");
  } catch (e) {
    return "0f04d16a175c411e";
  }
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  var result = 0;
  for (var i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export default {
  async fetch(request, env) {
    if (env.API_KEY) globalThis.API_KEY = env.API_KEY;
    return await handleRequest(request);
  },
};

async function handleRequest(request) {
  var url = new URL(request.url);

  if (url.pathname === "/" || url.pathname === "/index.html") {
    return new Response(getTestPageHTML(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS",
        "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers") || "Authorization, Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  if (url.pathname.startsWith("/v1/")) {
    var authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse("Missing or invalid authorization header.", 401, "invalid_api_key");
    }
    var providedKey = authHeader.slice(7);
    if (globalThis.API_KEY) {
      if (!timingSafeEqual(providedKey, globalThis.API_KEY)) {
        return errorResponse("Invalid API key.", 403, "invalid_api_key");
      }
    } else {
      return errorResponse("API key not configured on server.", 500, "server_config_error");
    }
  }

  try {
    if (url.pathname === "/v1/audio/speech") return await handleSpeechRequest(request);
    if (url.pathname === "/v1/models") return handleModelsRequest();
  } catch (err) {
    return errorResponse(err.message, 500, "internal_server_error");
  }

  return errorResponse("Not Found", 404, "not_found");
}

async function handleSpeechRequest(request) {
  if (request.method !== "POST") return errorResponse("Method Not Allowed", 405, "method_not_allowed");

  var body = await request.json();
  if (!body.input) return errorResponse("'input' is a required parameter.", 400, "invalid_request_error");

  var model = body.model || "tts-1";
  var input = body.input;
  var voice = body.voice;
  var speed = body.speed !== undefined ? body.speed : 1.0;
  var pitch = body.pitch !== undefined ? body.pitch : 1.0;
  var style = body.style || "general";
  var role = body.role || "";
  var styleDegree = body.styleDegree !== undefined ? body.styleDegree : 1.0;
  var stream = body.stream || false;
  var cleaning_options = body.cleaning_options || {};

  var finalVoice;
  if (model === "tts-1" || model === "tts-1-hd") {
    finalVoice = OPENAI_VOICE_MAP[voice] || voice || "zh-CN-XiaoxiaoNeural";
  } else if (model.startsWith("tts-1-")) {
    finalVoice = OPENAI_VOICE_MAP[model.replace("tts-1-", "")] || "zh-CN-XiaoxiaoNeural";
  } else {
    finalVoice = voice || model || "zh-CN-XiaoxiaoNeural";
  }

  var opts = {
    remove_markdown: cleaning_options.remove_markdown !== undefined ? cleaning_options.remove_markdown : true,
    remove_emoji: cleaning_options.remove_emoji !== undefined ? cleaning_options.remove_emoji : true,
    remove_urls: cleaning_options.remove_urls !== undefined ? cleaning_options.remove_urls : true,
    remove_line_breaks: cleaning_options.remove_line_breaks || false,
    remove_citation_numbers: cleaning_options.remove_citation_numbers !== undefined ? cleaning_options.remove_citation_numbers : true,
    custom_keywords: cleaning_options.custom_keywords || "",
  };
  var cleanedInput = cleanText(input, opts);
  var rate = ((speed - 1) * 100).toFixed(0);
  var numPitch = ((pitch - 1) * 100).toFixed(0);
  var outputFormat = "audio-24khz-48kbitrate-mono-mp3";

  if (stream) {
    return await getVoiceStream(cleanedInput, finalVoice, rate, numPitch, style, role, styleDegree, outputFormat, request);
  }
  return await getVoice(cleanedInput, finalVoice, rate, numPitch, style, role, styleDegree, outputFormat, request);
}

function handleModelsRequest() {
  var models = [
    { id: "tts-1", object: "model", created: Date.now(), owned_by: "openai" },
    { id: "tts-1-hd", object: "model", created: Date.now(), owned_by: "openai" },
  ];
  var keys = Object.keys(OPENAI_VOICE_MAP);
  for (var i = 0; i < keys.length; i++) {
    models.push({
      id: "tts-1-" + keys[i],
      object: "model",
      created: Date.now(),
      owned_by: "openai",
    });
  }
  return new Response(JSON.stringify({ object: "list", data: models }), {
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

// 智能分块：按句子边界切分，避免硬切
function splitTextIntoChunks(text, maxChunkSize) {
  var chunks = [];
  var sentenceBreaks = ["。", "！", "？", "；", "…", ".", "!", "?", "\n"];

  while (text.length > 0) {
    if (text.length <= maxChunkSize) {
      chunks.push(text);
      break;
    }

    var chunk = text.slice(0, maxChunkSize);
    var lastBreakIndex = -1;

    // 从后往前找句子边界
    for (var i = chunk.length - 1; i >= Math.floor(maxChunkSize * 0.5); i--) {
      var found = false;
      for (var j = 0; j < sentenceBreaks.length; j++) {
        if (chunk[i] === sentenceBreaks[j]) {
          lastBreakIndex = i;
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (lastBreakIndex > 0) {
      chunks.push(text.slice(0, lastBreakIndex + 1));
      text = text.slice(lastBreakIndex + 1);
    } else {
      // 找不到句子边界，硬切
      chunks.push(chunk);
      text = text.slice(maxChunkSize);
    }
  }

  return chunks;
}

async function getVoice(text, voiceName, rate, pitch, style, role, styleDegree, outputFormat, request) {
  var chunks = splitTextIntoChunks(text, 2000);
  var audioChunks = [];

  for (var i = 0; i < chunks.length; i++) {
    var blob = await getAudioChunk(chunks[i], voiceName, rate, pitch, style, role, styleDegree, outputFormat, request);
    audioChunks.push(blob);
  }

  return new Response(new Blob(audioChunks, { type: "audio/mpeg" }), {
    headers: { "Content-Type": "audio/mpeg", "Access-Control-Allow-Origin": "*" },
  });
}

async function getVoiceStream(text, voiceName, rate, pitch, style, role, styleDegree, outputFormat, request) {
  var chunks = splitTextIntoChunks(text, 2000);
  var transform = new TransformStream();
  var writer = transform.writable.getWriter();

  (async function () {
    try {
      for (var i = 0; i < chunks.length; i++) {
        var blob = await getAudioChunk(chunks[i], voiceName, rate, pitch, style, role, styleDegree, outputFormat, request);
        var buffer = await blob.arrayBuffer();
        await writer.write(new Uint8Array(buffer));
      }
    } catch (e) {
      await writer.abort(e);
    } finally {
      await writer.close();
    }
  })();

  return new Response(transform.readable, {
    headers: { "Content-Type": "audio/mpeg", "Access-Control-Allow-Origin": "*" },
  });
}

async function getAudioChunk(text, voiceName, rate, pitch, style, role, styleDegree, outputFormat, request) {
  var endpoint = await getEndpoint(request);
  var url = "https://" + endpoint.r + ".tts.speech.microsoft.com/cognitiveservices/v1";
  var escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

  var content = '<prosody rate="' + rate + '%" pitch="' + pitch + '%">' + escaped + "</prosody>";
  if (style && style !== "general") {
    var attr = styleDegree !== 1.0 ? ' styledegree="' + styleDegree + '"' : "";
    content = '<mstts:express-as style="' + style + '"' + attr + ">" + content + "</mstts:express-as>";
  }
  if (role) {
    content = '<mstts:express-as role="' + role + '">' + content + "</mstts:express-as>";
  }

  var ssml =
    '<speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN"><voice name="' +
    voiceName +
    '">' +
    content +
    "</voice></speak>";

  var res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: endpoint.t,
      "Content-Type": "application/ssml+xml",
      "User-Agent": "okhttp/4.5.0",
      "X-Microsoft-OutputFormat": outputFormat,
    },
    body: ssml,
  });
  if (!res.ok) {
    throw new Error("Edge TTS API error: " + res.status);
  }
  return res.blob();
}

async function getEndpoint(request) {
  var now = Date.now() / 1000;

  // 检查缓存的 token 是否有效
  if (tokenInfo.token && tokenInfo.expiredAt && now < tokenInfo.expiredAt - TOKEN_REFRESH_BEFORE_EXPIRY) {
    return tokenInfo.endpoint;
  }

  var endpointUrl = "https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0";
  var clientId = crypto.randomUUID().replace(/-/g, "");
  var userId = generateUserIdFromDomain(request.url);
  var lastError = null;

  for (var attempt = 1; attempt <= 3; attempt++) {
    try {
      var res = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Accept-Language": "zh-Hans",
          "X-ClientVersion": "4.0.530a 5fe1dc6c",
          "X-UserId": userId,
          "X-HomeGeographicRegion": "zh-Hans-CN",
          "X-ClientTraceId": clientId,
          "X-MT-Signature": await sign(endpointUrl),
          "User-Agent": "okhttp/4.5.0",
          "Content-Type": "application/json; charset=utf-8",
          "Content-Length": "0",
          "Accept-Encoding": "gzip",
        },
      });
      if (!res.ok) {
        throw new Error("HTTP " + res.status);
      }
      var data = await res.json();
      var jwt = JSON.parse(atob(data.t.split(".")[1]));
      tokenInfo = { endpoint: data, token: data.t, expiredAt: jwt.exp };
      return data;
    } catch (e) {
      lastError = e;
      if (attempt < 3) {
        await new Promise(function (r) {
          setTimeout(r, 1000 * attempt);
        });
      }
    }
  }

  // 所有重试都失败后的兜底逻辑
  if (tokenInfo.token) {
    // 强制标记为过期，下次请求会重新刷新
    tokenInfo.expiredAt = 0;
    return tokenInfo.endpoint;
  }

  throw new Error("Failed to get endpoint: " + (lastError ? lastError.message : "unknown"));
}

async function sign(urlStr) {
  var url = urlStr.split("://")[1];
  var encodedUrl = encodeURIComponent(url);
  var uuid = crypto.randomUUID().replace(/-/g, "");
  var date = new Date().toUTCString().replace(/GMT/, "").trim() + " GMT";
  var toSign = ("MSTranslatorAndroidApp" + encodedUrl + date + uuid).toLowerCase();
  var keyStr = "oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw==";
  var keyBytes = Uint8Array.from(atob(keyStr), function (c) {
    return c.charCodeAt(0);
  });
  var cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  var sigBytes = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(toSign)));
  var sig = btoa(String.fromCharCode.apply(null, sigBytes));
  return "MSTranslatorAndroidApp::" + sig + "::" + date + "::" + uuid;
}

function cleanText(text, opts) {
  var t = text;
  if (opts.remove_urls) {
    t = t.replace(/(https?:\/\/[^\s]+)/g, "");
  }
  if (opts.remove_markdown) {
    t = t
      .replace(/!\[.*?\]\(.*?\)/g, "")
      .replace(/\[(.*?)\]\(.*?\)/g, "$1")
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")
      .replace(/`{1,3}(.*?)`{1,3}/g, "$1")
      .replace(/#{1,6}\s/g, "");
  }
  if (opts.custom_keywords) {
    var kw = opts.custom_keywords
      .split(",")
      .map(function (k) {
        return k.trim();
      })
      .filter(function (k) {
        return k;
      });
    if (kw.length) {
      var pattern = kw
        .map(function (k) {
          return k.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        })
        .join("|");
      t = t.replace(new RegExp(pattern, "g"), "");
    }
  }
  if (opts.remove_emoji) {
    t = t.replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
      ""
    );
  }
  if (opts.remove_citation_numbers) {
    t = t.replace(/\[\d+\]/g, "").replace(/【\d+】/g, "");
  }
  if (opts.remove_line_breaks) {
    t = t.replace(/(\r\n|\n|\r)/gm, "");
    return t.trim().replace(/\s+/g, " ");
  }
  return t.trim().replace(/[ \t]+/g, " ");
}

function errorResponse(message, status, code) {
  return new Response(JSON.stringify({ error: { message: message, type: "api_error", code: code } }), {
    status: status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

function getTestPageHTML() {
  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>TTS 测试</title>\n  <style>\n    * { box-sizing: border-box; }\n    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }\n    .container { max-width: 600px; margin: 0 auto; background: #fff; padding: 24px; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.1); }\n    h1 { text-align: center; color: #333; margin: 0 0 24px; font-size: 24px; }\n    .form-group { margin-bottom: 16px; }\n    label { display: block; font-weight: 500; margin-bottom: 6px; color: #333; }\n    input, select, textarea { width: 100%; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; }\n    input:focus, select:focus, textarea:focus { outline: none; border-color: #007bff; }\n    textarea { min-height: 100px; resize: vertical; }\n    .row { display: flex; gap: 12px; }\n    .row > * { flex: 1; }\n    .slider-wrap { display: flex; align-items: center; gap: 10px; }\n    .slider-wrap input[type="range"] { flex: 1; }\n    .slider-wrap span { min-width: 40px; text-align: right; font-weight: 500; }\n    .btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; transition: background 0.2s; }\n    .btn-primary { background: #007bff; color: #fff; }\n    .btn-primary:hover { background: #0056b3; }\n    .btn-primary:disabled { background: #ccc; cursor: not-allowed; }\n    #status { margin-top: 16px; padding: 12px; border-radius: 8px; text-align: center; display: none; }\n    .status-error { background: #fee; color: #c00; }\n    .status-success { background: #efe; color: #060; }\n    .status-loading { background: #eef; color: #006; }\n    audio { width: 100%; margin-top: 16px; display: none; }\n    .api-info { margin-top: 20px; padding: 16px; background: #f8f9fa; border-radius: 8px; font-size: 13px; }\n    .api-info code { background: #e9ecef; padding: 2px 6px; border-radius: 4px; }\n  </style>\n</head>\n<body>\n  <div class="container">\n    <h1>TTS 测试</h1>\n    <div class="form-group">\n      <label>API Key</label>\n      <input type="password" id="apiKey" placeholder="输入你的 API Key">\n    </div>\n    <div class="form-group">\n      <label>文本内容</label>\n      <textarea id="text" placeholder="输入要转换的文本...">你好，这是一个语音合成测试。</textarea>\n    </div>\n    <div class="row">\n      <div class="form-group">\n        <label>语音</label>\n        <select id="voice">\n          <option value="shimmer">shimmer - 温柔女声</option>\n          <option value="alloy" selected>alloy - 专业男声</option>\n          <option value="fable">fable - 激情男声</option>\n          <option value="onyx">onyx - 活泼女声</option>\n          <option value="nova">nova - 阳光男声</option>\n          <option value="echo">echo - 东北女声</option>\n        </select>\n      </div>\n      <div class="form-group">\n        <label>语速</label>\n        <div class="slider-wrap">\n          <input type="range" id="speed" min="0.5" max="2" step="0.1" value="1">\n          <span id="speedVal">1.0</span>\n        </div>\n      </div>\n    </div>\n    <button class="btn btn-primary" id="generateBtn" onclick="generate()">生成语音</button>\n    <div id="status"></div>\n    <audio id="player" controls></audio>\n    <div class="api-info">\n      <strong>API 端点：</strong><code id="endpoint"></code>\n    </div>\n  </div>\n  <script>\n    var $ = function(id) { return document.getElementById(id); };\n    $("endpoint").textContent = location.origin + "/v1/audio/speech";\n    $("apiKey").value = localStorage.getItem("tts_api_key") || "";\n    $("speed").oninput = function() { $("speedVal").textContent = parseFloat($("speed").value).toFixed(1); };\n    function showStatus(msg, type) {\n      $("status").textContent = msg;\n      $("status").className = "status-" + type;\n      $("status").style.display = "block";\n    }\n    function generate() {\n      var apiKey = $("apiKey").value.trim();\n      var text = $("text").value.trim();\n      if (!apiKey) { showStatus("请输入 API Key", "error"); return; }\n      if (!text) { showStatus("请输入文本", "error"); return; }\n      localStorage.setItem("tts_api_key", apiKey);\n      $("generateBtn").disabled = true;\n      $("player").style.display = "none";\n      showStatus("生成中...", "loading");\n      fetch(location.origin + "/v1/audio/speech", {\n        method: "POST",\n        headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },\n        body: JSON.stringify({ model: "tts-1", voice: $("voice").value, input: text, speed: parseFloat($("speed").value) })\n      }).then(function(res) {\n        if (!res.ok) return res.json().then(function(e) { throw new Error(e.error ? e.error.message : "HTTP " + res.status); });\n        return res.blob();\n      }).then(function(blob) {\n        $("player").src = URL.createObjectURL(blob);\n        $("player").style.display = "block";\n        $("player").play();\n        showStatus("生成成功", "success");\n      }).catch(function(e) {\n        showStatus("错误: " + e.message, "error");\n      }).finally(function() {\n        $("generateBtn").disabled = false;\n      });\n    }\n  </script>\n</body>\n</html>';
}
