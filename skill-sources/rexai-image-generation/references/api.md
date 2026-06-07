# RexAI Image API Reference

Source: `https://tool.rexai.top/docs/api` and its JSON data endpoint `https://tool.rexai.top/api/api-docs`, read on 2026-06-07.

## Authentication

Use either header:

```text
Authorization: Bearer <REXAI_API_KEY>
x-api-key: <REXAI_API_KEY>
```

The bundled script uses `Authorization: Bearer ...`.

## Base URL

Default base URL: `https://coding.rexai.top`

The docs page reports `baseUrl: "/"`, and its client code falls back to `https://coding.rexai.top` when the value is not an absolute HTTP URL.

## Submit Image Job

Endpoint:

```text
POST /v1/images/generations
```

Text-to-image body:

```json
{
  "model": "gpt-image-2",
  "prompt": "A cat sleeping in sunlight",
  "n": 1,
  "size": "1024x1024"
}
```

Image-to-image body:

```json
{
  "model": "gpt-image-2-i2i",
  "prompt": "Convert this image to watercolor style",
  "images": ["https://example.com/source-image.jpg"],
  "n": 1
}
```

Submit response is `202 Accepted`:

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "object": "image.generation.job",
  "status": "pending",
  "productId": "gpt-image-2",
  "providerTaskId": ""
}
```

## Poll Job Result

Endpoint:

```text
GET /v1/images/jobs/{id}
```

Poll every 2-5 seconds until `status` is `succeeded` or `failed`.

Succeeded response shape:

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "status": "succeeded",
  "product_id": "gpt-image-2",
  "result": {
    "url": "https://cdn.example.com/images/xxx.png",
    "b64_json": null,
    "expires_at": "2026-06-29T01:00:00.000Z"
  }
}
```

## Parameters

Text-to-image:

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `model` | string | yes | RexAI image product ID, not upstream provider model name |
| `prompt` | string | yes | Image description |
| `n` | integer | no | Image count, default 1 |
| `size` | string | no | Example: `1024x1024` |

Image-to-image:

| Parameter | Type | Required | Notes |
| --- | --- | --- | --- |
| `model` | string | yes | RexAI image product ID |
| `prompt` | string | conditionally | Description or edit instruction |
| `images` | string[] | yes | Reference images; use an array even for one image |
| `n` | integer | no | Image count, default 1 |
| `size` | string | no | Output size |

Do not send `imageSize` or `image_size`; docs list these as invalid for the image API.

## Products

Current active text-to-image products:

- `gpt-image-2` - gpt-image-2

Current active image-to-image products:

- `gpt-image-2-i2i` - gpt-image-2-i2i

Product availability and pricing can change; refresh `https://tool.rexai.top/api/api-docs` when a call fails due to model availability.

## Sizes

- `256x256`
- `512x512`
- `1024x1024`
- `1792x1024`
- `1024x1792`

## Common Errors

- `permission_denied`: API key lacks permission.
- `invalid_request_error`: request format is wrong.
- `model_not_found`: model is unavailable.
- `rate_limit_error`: rate limit exceeded.
- `service_unavailable`: no available account.
- `insufficient_package_quota`: package quota is insufficient.
- `insufficient_direct_balance`: direct balance is insufficient.
- `invalid_parameter`: image API rejects `imageSize` or `image_size`.
- `invalid_model`: missing or invalid `model`.
- `image_call_limit_exhausted`: daily image call limit exceeded.
- `image_upstream_failed`: upstream image provider failed.


