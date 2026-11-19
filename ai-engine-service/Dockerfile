FROM python:3.10-slim

WORKDIR /app

# Pehle sirf requirements copy kar taaki Docker cache intact rahe
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Ab baaki ka code copy kar
COPY . /app

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]