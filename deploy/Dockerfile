# Multi-stage build for MarkFlow
FROM python:3.11.9-slim AS builder

WORKDIR /app

# Install uv for fast package installation
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy requirements and install dependencies
COPY requirements.txt .
RUN uv venv /app/.venv && \
    uv pip install --no-cache -r requirements.txt

# Final runner stage
FROM python:3.11.9-slim AS runner

WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PATH="/app/.venv/bin:$PATH" \
    HOST=0.0.0.0

# Install system dependencies, upgrade OS packages for security fixes & cleanup setuid
RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    libmagic1 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && find / -perm /6000 -type f -exec chmod a-s {} + 2>/dev/null || true

# Create non-root user
RUN groupadd -g 1001 appgroup && \
    useradd -u 1001 -g appgroup -s /bin/sh -m appuser

# Copy virtual environment and project files
COPY --from=builder /app/.venv /app/.venv
COPY core/ /app/core/

# Create necessary directories and set ownership
RUN mkdir -p /app/markdown_docs /app/config && \
    chown -R appuser:appgroup /app

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://127.0.0.1:8000/ || exit 1

# Switch to non-root user
USER appuser

EXPOSE 8000

CMD ["python", "core/main.py"]
