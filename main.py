import os
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

app = FastAPI()

# 1. ALLOW CORS (So your browser can talk to this backend)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For production, you might restrict this later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. DATA MODEL (Expects JSON from the frontend)
class LoginRequest(BaseModel):
    username: str
    password: str

# 3. ENVIRONMENT VARIABLES (From Render Settings)
CLIENT_ID = os.getenv("RL_CLIENT_ID")
CLIENT_SECRET = os.getenv("RL_CLIENT_SECRET")
# Ensure this is https://pbx.simplelogin.net/ns-api (No /v2)
NS_API_BASE = os.getenv("NS_API_BASE", "https://pbx.simplelogin.net/ns-api")

# --- ROUTES ---

# SERVE THE UI
@app.get("/")
async def read_root():
    return FileResponse('index.html')

# PROXY THE LOGIN
@app.post("/auth/login")
async def login_proxy(creds: LoginRequest):
    if not CLIENT_ID or not CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Server misconfiguration: Missing Secrets")

    # The NetSapiens Token URL
    token_url = f"{NS_API_BASE}/oauth2/token"

    payload = {
        "grant_type": "password",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "username": creds.username,
        "password": creds.password
    }

    try:
        response = requests.post(token_url, data=payload)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.HTTPError as e:
        # Pass the exact error from RingLogix back to the UI
        raise HTTPException(status_code=response.status_code, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
