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

Image-to-image body — **same product ID as text-to-image**; the `images` field makes the relay take the image-to-image route (`gpt-image-2-i2i` does not exist, `404`):

```json
{
  "model": "gpt-image-2",
  "prompt": "Convert this image to watercolor style",
  "images": ["data:image/png;base64,..."],
  "n": 1
}
```

Use base64 data URIs in `images` (local files → `data:image/<mime>;base64,...`). If you pass a public http(s) URL, the relay server downloads it itself and hotlink-protected hosts reject that with `403`.

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

Image-to-image uses the **same product** (`gpt-image-2`) with an `images` array in the body; there is no separate i2i product ID. A `gpt-image-2-i2i` product does not exist (`404 image_product_not_found`). Nano2-series IDs (`nano2-1k-i2i`, etc.) have appeared on some instances — confirm against the instance's product list with one probe before use.

Product availability and pricing can change per instance; refresh `https://tool.rexai.top/api/api-docs` or probe the instance when a call fails due to model availability.

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


