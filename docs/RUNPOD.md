# Runpod Guide

[Return to User Guide](USER_GUIDE.md#accessing-the-interface)

Runpod offers GPU rental at a good price for running the latest image and video models, so you do not have to grind and optimise workflows yourself.

## Setup

After signing up, create a Network Disk (large enough for the models) and use the **ComfyUI SAUS template**.

<img src="../web/core/media/git/RUNPOD-SAUS-template.png">

> [!NOTE]
> The template uses PyTorch 2.8, so the pod should have CUDA 12.8 or higher.

> [!WARNING]
> If you already have ComfyUI installed on a Network Disk, the template will not install the custom node. Install SAUS first via ComfyUI-Manager, then use the template to reach the right ports.

## Accessing SAUS on a pod

SAUS is served on **port 7771**. Open that port from the pod panel, or open ComfyUI and click the **Simple App** icon on the left toolbar. See [Accessing SAUS](ACCESSING.md) for the walk-through.

[Return to User Guide](USER_GUIDE.md#accessing-the-interface)