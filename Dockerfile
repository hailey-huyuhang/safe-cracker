# Stage 1: build the Angular frontend
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: run the Flask API, which also serves the built frontend
FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./backend/
COPY --from=frontend /build/dist ./frontend/dist
ENV PORT=8000
EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--threads", "8", "backend.app:app"]
