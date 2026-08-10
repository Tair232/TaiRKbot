FROM node:24-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1

# FFmpeg нужен для преобразования найденного трека в Discord PCM.
# Python + venv нужны для актуального yt-dlp.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       ffmpeg \
       python3 \
       python3-pip \
       python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Отдельное окружение, чтобы не конфликтовать с системным Python Debian.
RUN python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/yt-dlp/bin/pip install --no-cache-dir --pre "yt-dlp[default,curl-cffi]"

ENV PATH="/opt/yt-dlp/bin:${PATH}"

# На Bothost /app может монтироваться отдельно, поэтому код приложения
# держим вне /app.
WORKDIR /usr/src/tairkbot

COPY package*.json ./
RUN npm install

COPY . .

# Проверяем, что системные зависимости реально попали в образ.
RUN node --version \
    && yt-dlp --version \
    && ffmpeg -version | head -n 1

EXPOSE 3000

CMD ["node", "server.js"]
