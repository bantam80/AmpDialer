import os
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class LoginRequest(BaseModel):
    username: str
    password: str

CLIENT_ID = os.getenv("RL_CLIENT_ID")
CLIENT_SECRET = os.getenv("RL_CLIENT_SECRET")
NS_API_BASE = os.getenv("NS_API_BASE", "https://pbx.simplelogin.net/ns-api")

# --- ROUTES ---

@app.get("/")
async def read_root():
    return FileResponse('index.html')

# 👇 UPDATED: Serve the specific filename
@app.get("/sip-0.21.2.min.js")
async def read_sip_lib():
    return FileResponse('sip-0.21.2.min.js')

@app.post("/auth/login")
async def login_proxy(creds: LoginRequest):
    if not CLIENT_ID or not CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Server misconfiguration: Missing Secrets")

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
        raise HTTPException(status_code=response.status_code, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
