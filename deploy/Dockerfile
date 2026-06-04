# Stage 1: Build stage
FROM python:3.11.9-slim AS builder

# Copy the uv executable from the official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install Python dependencies into virtual environment
COPY requirements.txt .
RUN uv venv /app/.venv && \
    uv pip install --no-cache -r requirements.txt

# Stage 2: Final runner stage
FROM python:3.11.9-slim AS runner

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    libmagic1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Copy virtual environment from builder stage
COPY --from=builder /app/.venv /app/.venv

# Copy project files
COPY core/ /app/core/

# Create necessary directories
RUN mkdir -p /app/markdown_docs /app/config

# Expose port
EXPOSE 8000

# Run the application
CMD ["python", "core/main.py"]
