FROM node:20-slim

# Pandoc と SVG→PNG変換ツールをインストール
RUN apt-get update && apt-get install -y \
    pandoc \
    librsvg2-bin \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 依存関係インストール
COPY package.json package-lock.json* ./
RUN npm install

# ソースコピー & ビルド
COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
