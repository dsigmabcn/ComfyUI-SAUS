# Runpod Guide

[Return to User Guide](USER_GUIDE.md#accessing-the-interface)

Runpod offers GPU rental at a good price for running the latest image and video models, so you do not have to grind and optimise workflows yourself.

## Setup

Deploy **ComfyUI latest - SAUS - KN**: the latest ComfyUI with ComfyUI-Manager and SAUS already in it.

**[Open the template →](https://console.runpod.io/hub/template/3c0tdgrly3?ref=617ypn0k)**

<img src="../web/core/media/git/RUNPOD-SAUS-template.png">

- **GPU:** pick one whose driver supports **CUDA 13 or higher** — that is what the template's image is built for.
- **Network Disk:** the template requires one. It is where ComfyUI, its `models/` folder and your generated files live between pods (it mounts at `/workspace`).

> [!NOTE]
> The first start takes a while: the template updates ComfyUI and SAUS and downloads what they need. Later starts are much shorter. Once the log prints `Redirect server running on port 7771`, SAUS is up.

## Accessing SAUS on a pod

**Open port 7771** — from the pod panel, or from **Connect → HTTP Service** (Runpod shows it as `<pod-id>-7771.proxy.runpod.net`, handy to bookmark). On a pod SAUS answers there and sends you on to ComfyUI with `/saus` appended, so 7771 is the address to remember.

You can also open ComfyUI itself (port 8188) and click the **Simple App** flame in the left toolbar. See [Accessing SAUS](ACCESSING.md) for the walk-through.

[Return to User Guide](USER_GUIDE.md#accessing-the-interface)
