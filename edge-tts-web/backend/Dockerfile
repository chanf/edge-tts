FROM python:3.9-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app

ENV PYTHONUNBUFFERED=1
EXPOSE 6605

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "6605"]
