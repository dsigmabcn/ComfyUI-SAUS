# Runpod Guide

Runpod offers rental of GPU's at a good price that can be used to run the latest image and video models. This is convenient as you do not need to keep grinding and optimizing workflows to get a sub-optimal quality in your results.

## Setup

After signing up in Runpod, create a Network Disk (with enough capacity to run the models) and use the ComfyUI SAUS template.

<img src="../web/core/media/git/RUNPOD-SAUS-template.png">

> [!NOTE]
> The template uses pytorch 2.8, the pod should have CUDA 12.8 or higher

> [!WARNING]
> If you already have ComfyUI in a Network Drive installed, the template will not install the custom node. Install it first via the manager, then later you can use the template to access the right ports.