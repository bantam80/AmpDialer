import os
import requests
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# 1. ALLOW CORS (So Zoho can talk to this)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, change this to your GitHub Pages URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. CONFIG FROM ENV VARS (Secure Storage)
CLIENT_ID = os.getenv("RL_CLIENT_ID")
CLIENT_SECRET = os.getenv("RL_CLIENT_SECRET")
# Base URL for RingLogix/NetSapiens (Check your specific regional URL)
NS_API_BASE = os.getenv("NS_API_BASE", "https://api.ringlogix.com/ns-api/v2")

class LoginRequest(BaseModel):
    username: str
    password: str

@app.get("/")
def health_check():
    return {"status": "Proxy is running 🚀"}

@app.post("/auth/login")
def proxy_login(creds: LoginRequest):
    """
    Takes User/Pass from Frontend.
    Adds Client ID/Secret.
    Returns Access Token from RingLogix.
    """
    if not CLIENT_ID or not CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Server misconfiguration: Missing Secrets")

    # Prepare the official OAuth2 Payload
    payload = {
        "grant_type": "password",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "username": creds.username,
        "password": creds.password
    }

    try:
        # Forward request to NetSapiens
        response = requests.post(f"{NS_API_BASE}/oauth2/token", data=payload)
        
        # If upstream failed (wrong password, etc.), return the error
        if not response.ok:
            raise HTTPException(status_code=response.status_code, detail=response.text)

        # Return the clean Token JSON to the frontend
        return response.json()

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
