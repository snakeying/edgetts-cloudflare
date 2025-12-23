<h1 align="center">
🎵 Edge TTS Cloudflare Worker
</h1>

<p align="center">
    <br> English | <a href="README.md">中文</a>
</p>
<p align="center">

> Wrap Microsoft Edge's neural network speech synthesis into OpenAI TTS API compatible format, deployed on Cloudflare Workers. Free, fast, no server needed!

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/snakeying/edge-tts-worker)

## ✨ Features

- 🆓 **Completely Free** - Built on Edge TTS, no paid API required
- 🚀 **Ultra Low Latency** - Accelerated by Cloudflare's global edge network
- 🔌 **OpenAI Compatible** - Drop-in replacement for OpenAI TTS API, seamless migration
- 🎭 **Multiple Voices** - 6 preset voices + support for all native Edge TTS voices
- 🛡️ **Secure & Controllable** - Protected with custom API Key
- 📱 **Built-in WebUI** - Test directly in browser, no coding needed

## 🚀 Quick Deploy

### Method 1: Cloudflare Dashboard (Recommended)

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to **Workers & Pages** → **Create Application** → **Create Worker**
3. Give it any name, click **Deploy**
4. Click **Edit code**, delete default code, paste content from `worker.js`
5. Click **Save and Deploy** 🎉

### Method 2: Wrangler CLI

```bash
git clone https://github.com/snakeying/edge-tts-worker.git
cd edge-tts-worker
npx wrangler deploy
```

### Set API Key (Important!)

After deployment, go to Worker settings:

**Settings** → **Variables** → **Add variable**

| Variable name | Value |
|---------------|-------|
| `API_KEY` | Your custom key (e.g., `sk-my-secret-key`) |

> ⚠️ Without setting API Key, the API will return 500 error!

## 📖 API Usage

### Endpoint

```
POST https://your-worker.your-subdomain.workers.dev/v1/audio/speech
```

### Request Format

Fully compatible with [OpenAI TTS API](https://platform.openai.com/docs/api-reference/audio/createSpeech):

```json
{
  "model": "tts-1",
  "input": "Hello, world!",
  "voice": "alloy",
  "speed": 1.0
}
```

### cURL Examples

**Basic Usage** 🎯

```bash
curl -X POST "https://your-worker.workers.dev/v1/audio/speech" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1",
    "input": "Hello, this is a test speech.",
    "voice": "alloy"
  }' \
  --output speech.mp3
```

**Adjust Speed** 🏃

```bash
curl -X POST "https://your-worker.workers.dev/v1/audio/speech" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1",
    "input": "This will be spoken faster!",
    "voice": "nova",
    "speed": 1.5
  }' \
  --output fast.mp3
```

**Use Native Edge TTS Voice** 🎭

```bash
curl -X POST "https://your-worker.workers.dev/v1/audio/speech" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1",
    "input": "Hello, this is a test with English voice.",
    "voice": "en-US-JennyNeural"
  }' \
  --output english.mp3
```

**Advanced Parameters** 🔧

```bash
curl -X POST "https://your-worker.workers.dev/v1/audio/speech" \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "tts-1",
    "input": "This is **formatted** text with link https://example.com and emoji 😊",
    "voice": "shimmer",
    "speed": 1.2,
    "pitch": 1.1,
    "style": "cheerful",
    "cleaning_options": {
      "remove_markdown": true,
      "remove_emoji": true,
      "remove_urls": true
    }
  }' \
  --output advanced.mp3
```

### Get Available Models

```bash
curl "https://your-worker.workers.dev/v1/models" \
  -H "Authorization: Bearer your-api-key"
```

## 🎭 Preset Voices

| Voice | Description | Edge TTS Voice |
|-------|-------------|----------------|
| `shimmer` | Gentle Female | zh-CN-XiaoxiaoNeural |
| `alloy` | Professional Male | zh-CN-YunyangNeural |
| `fable` | Energetic Male | zh-CN-YunjianNeural |
| `onyx` | Lively Female | zh-CN-XiaoyiNeural |
| `nova` | Cheerful Male | zh-CN-YunxiNeural |
| `echo` | Northeast Female | zh-CN-liaoning-XiaobeiNeural |

> 💡 You can also directly use any [Edge TTS native voice](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts), such as `en-US-JennyNeural`, `ja-JP-NanamiNeural`, etc.

## ⚙️ Full Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `model` | string | `tts-1` | Model name (compatibility, doesn't affect actual output) |
| `input` | string | **Required** | Text to convert |
| `voice` | string | `shimmer` | Voice name |
| `speed` | number | `1.0` | Speech rate (0.5 - 2.0) |
| `pitch` | number | `1.0` | Pitch (0.5 - 1.5) |
| `style` | string | `general` | Speech style |
| `role` | string | - | Role play |
| `styleDegree` | number | `1.0` | Style intensity (0.01 - 2.0) |
| `stream` | boolean | `false` | Stream output |
| `cleaning_options` | object | - | Text cleaning options |

### cleaning_options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `remove_markdown` | boolean | `true` | Remove Markdown formatting |
| `remove_emoji` | boolean | `true` | Remove Emoji |
| `remove_urls` | boolean | `true` | Remove URLs |
| `remove_line_breaks` | boolean | `false` | Remove line breaks |
| `remove_citation_numbers` | boolean | `true` | Remove citation markers `[1]` |
| `custom_keywords` | string | - | Custom keywords to remove (comma-separated) |

## 🖥️ WebUI

After deployment, visit the Worker root path to use the built-in test page:

```
https://your-worker.workers.dev/
```

![WebUI Screenshot](screenshot.png)

## 🔗 Use in Other Applications

### OpenAI SDK (Python)

```python
from openai import OpenAI

client = OpenAI(
    api_key="your-api-key",
    base_url="https://your-worker.workers.dev/v1"
)

response = client.audio.speech.create(
    model="tts-1",
    voice="alloy",
    input="Hello, world!"
)

response.stream_to_file("output.mp3")
```

### OpenAI SDK (Node.js)

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'your-api-key',
  baseURL: 'https://your-worker.workers.dev/v1',
});

const mp3 = await openai.audio.speech.create({
  model: 'tts-1',
  voice: 'alloy',
  input: 'Hello, world!',
});

const buffer = Buffer.from(await mp3.arrayBuffer());
await fs.promises.writeFile('output.mp3', buffer);
```

## ❓ FAQ

**Q: Is the free tier enough?**

A: Cloudflare Workers free plan offers 100K requests per day, more than enough for personal use ✌️

**Q: What languages are supported?**

A: Edge TTS supports 100+ languages and regional variants, [check the full list here](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=tts)

**Q: Why am I getting 500 errors?**

A: Most likely you haven't set the `API_KEY` environment variable. Just add it in Worker Settings

**Q: Will long texts be truncated?**

A: Nope! The code automatically splits by sentence boundaries intelligently, then stitches them into complete audio 🧠

## 📄 License

MIT License - Use it however you want, just have fun 😄

## 🙏 Acknowledgments

- [Microsoft Edge TTS](https://azure.microsoft.com/en-us/products/ai-services/text-to-speech) - Providing high-quality speech synthesis
- [Cloudflare Workers](https://workers.cloudflare.com/) - Providing free edge computing platform

---

**If you find this useful, give it a ⭐ Star!**
