# syntax=docker/dockerfile:1
# ---------- Stage 1: cài dependency vào virtualenv ----------
FROM python:3.12-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
# Nếu thư viện cần biên dịch (vd psycopg2) hãy dùng psycopg[binary] / psycopg2-binary,
# hoặc bỏ comment dòng dưới (stage này không vào image cuối nên không tốn RAM khi chạy):
# RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev
COPY requirements.txt .
RUN pip install -r requirements.txt

# ---------- Stage 2: image chạy ----------
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PATH="/opt/venv/bin:$PATH"
RUN useradd --system --uid 1001 --create-home app
WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --chown=app:app . .
USER app
EXPOSE 8000

# GIẢ ĐỊNH: FastAPI, module app/main.py, biến `app`. Đổi lệnh này theo framework của bạn:
#   Flask/Django: ["gunicorn", "-b", "0.0.0.0:8000", "-w", "1", "--threads", "4", "app:app"]
# Chỉ 1 worker để tiết kiệm RAM trên t3.micro.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
