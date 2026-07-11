# docker compose up --build  ->  app on http://localhost:5173
FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# web stage pre-builds the frontend; `vite preview` serves it
FROM base AS web
RUN npm run build
