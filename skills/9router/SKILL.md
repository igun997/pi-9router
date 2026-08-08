---
name: 9router
description: Entry point for 9Router — local/remote AI gateway with OpenAI-compatible REST for chat, image, TTS, embeddings, web search, web fetch. Use when the user mentions 9Router, NINEROUTER_URL, or wants AI without writing provider boilerplate. This skill covers setup + indexes capability skills; fetch the relevant capability SKILL.md from the URLs below when needed.
---

# 9Router

Local/remote AI gateway exposing OpenAI-compatible REST. One key, many providers, auto-fallback.

## Setup

```bash
export NINEROUTER_URL="http://localhost:20128"      # or VPS / tunnel URL
export NINEROUTER_KEY="sk-..."                      # from Dashboard → Keys (only if requireApiKey=true)
```

All requests: `${NINEROUTER_URL}/v1/...` with header `Authorization: Bearer ${NINEROUTER_KEY}` (omit if auth disabled).

Verify: `curl $NINEROUTER_URL/api/health` → `{"ok":true}`

## Discover models

```bash
curl $NINEROUTER_URL/v1/models                  # chat/LLM (default)
curl $NINEROUTER_URL/v1/models/image            # image-gen
curl $NINEROUTER_URL/v1/models/tts              # text-to-speech
curl $NINEROUTER_URL/v1/models/embedding        # embeddings
curl $NINEROUTER_URL/v1/models/web              # web search + fetch (entries have `kind` field)
curl $NINEROUTER_URL/v1/models/stt              # speech-to-text
curl $NINEROUTER_URL/v1/models/image-to-text    # vision
```

Use `data[].id` as `model` field in requests. Combos appear with `owned_by:"combo"`.

Response shape:
```json
{ "object": "list", "data": [
  { "id": "openai/gpt-5", "object": "model", "owned_by": "openai", "created": 1735000000 },
  { "id": "tavily/search", "object": "model", "kind": "webSearch", "owned_by": "tavily", "created": 1735000000 }
]}
```

`/v1/models` entries usually carry a `capabilities` object. Filter on it instead of guessing from the model name:

```json
{ "vision": true, "pdf": false, "audioInput": false, "videoInput": false,
  "imageOutput": false, "audioOutput": false, "search": true, "tools": true,
  "reasoning": true, "thinkingFormat": "openai", "thinkingCanDisable": true,
  "thinkingRange": null, "contextWindow": 400000, "maxOutput": 128000 }
```

```bash
# vision-capable chat models
curl -s $NINEROUTER_URL/v1/models | jq -r '.data[] | select(.capabilities.vision) | .id'
```

Two reduced shapes exist: some routes publish only `{ thinking, agentic }` with no limits, and `combo` routes publish no `capabilities` at all. Treat missing fields as unknown, not as `false` limits.

Send images to a vision model with standard OpenAI content parts:

```json
{ "model": "cx/gpt-5.5", "messages": [{ "role": "user", "content": [
  { "type": "text", "text": "What is in this image?" },
  { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }
]}]}
```

## Capability skills

When the user needs a specific capability, read the relevant skill from this extension's skills directory:

| Capability | Skill |
|---|---|
| Image generation | [9router-image](../9router-image/SKILL.md) |
| Web search | [9router-web-search](../9router-web-search/SKILL.md) |
| Web fetch (URL → markdown) | [9router-web-fetch](../9router-web-fetch/SKILL.md) |

## Errors

- 401 → set/refresh `NINEROUTER_KEY` (Dashboard → Keys)
- 400 `Invalid model format` → check `model` exists in `/v1/models/<kind>`
- 503 `All accounts unavailable` → wait `retry-after` or add another provider account
