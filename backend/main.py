from fastapi import FastAPI

app = FastAPI(title="Smart Parking API", version="1.0.0")

@app.get("/")
def root():
    return {"status": "ok", "message": "Backend environment is ready"}

@app.get("/api/health")
def health_check():
    return {"status": "healthy"}