#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
RiseHope Automated Facebook Content Engine & Scheduler
Generates high-trust, educational, and empathetic organic oncology/advocacy posts
using OpenRouter (Gemini 2.5 Flash Lite) and publishes via residential proxy to Facebook Page.
"""

import os
import sys
import json
import time
import hmac
import hashlib
import random
import argparse
import datetime
from urllib.parse import quote
import requests
from dotenv import load_dotenv

# Force UTF-8 stdout on Windows
if sys.platform == "win32":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")


# 1. Environment & Paths
ENV_PATH = r"C:\Users\iakwv\Downloads\FB ads manager\.env"
HISTORY_PATH = r"C:\Users\iakwv\Downloads\GFM New Cloaked\operator\fb_post_history.json"
load_dotenv(ENV_PATH)

OPENROUTER_API_KEY = os.environ.get(
    "OPENROUTER_API_KEY",
    "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"
)
USER_TOKEN = os.environ.get("FB_USER_ACCESS_TOKEN")
SECRET = os.environ.get("FB_APP_SECRET")
PAGE_ID = os.environ.get("FB_TARGET_PAGE_ID", "113297813778299")
VERSION = os.environ.get("GRAPH_API_VERSION", "v25.0")

# Primary and fallback models on OpenRouter
MODELS = [
    "google/gemini-2.5-flash-lite",
    "google/gemini-3.5-flash-lite",
    "google/gemini-3.1-flash-lite"
]

# Residential proxy setup
PROXY_USER = quote(os.environ.get("PROXY_USER", ""), safe="")
PROXY_PASS = quote(os.environ.get("PROXY_PASS", ""), safe="")
PROXY_HOST = os.environ.get("PROXY_HOST", "")
PROXY_PORT = os.environ.get("PROXY_PORT", "")
PROXY_URL = f"http://{PROXY_USER}:{PROXY_PASS}@{PROXY_HOST}:{PROXY_PORT}"

# Content Rotation Angles (Pillars 1 to 4)
TOPICS = [
    {
        "pillar": "Breakthrough Science & Immunotherapy",
        "prompt": "Write an educational, accessible post explaining how Dendritic Cell Therapy / Tumor Vaccines train the immune system to recognize residual cancer cells after surgery."
    },
    {
        "pillar": "Medical Horizons",
        "prompt": "Write an educational post on how Proton Beam Therapy minimizes radiation damage to surrounding healthy brain and organ tissue in pediatric oncology."
    },
    {
        "pillar": "Science & Biomarkers",
        "prompt": "Write an educational post explaining what MGMT promoter methylation means in glioblastoma and why biomarker testing is key for personalized treatment plans."
    },
    {
        "pillar": "Patient Advocacy & Healthcare Economics",
        "prompt": "Write an advocacy post discussing why innovative cancer treatments take 5-10 years to reach standard insurance approval, and how community solidarity bridges the urgent treatment gap."
    },
    {
        "pillar": "Caregiver & Family Solidarity",
        "prompt": "Write a deeply empathetic, encouraging post honoring parents, spouses, and caregivers who stay by patient bedsides and navigate complex oncology journeys."
    },
    {
        "pillar": "Breakthrough Science",
        "prompt": "Write an educational post explaining Tumor-Treating Fields (TTFields) and how low-intensity electric fields disrupt cancer cell division."
    },
    {
        "pillar": "Science & Biomarkers",
        "prompt": "Write an educational post on IDH1 and IDH2 mutations in brain tumors, explaining how molecular subtyping provides clarity on prognosis and targeted therapies."
    },
    {
        "pillar": "Global Treatment Access",
        "prompt": "Write an advocacy post discussing why patients frequently seek specialized clinical trials or advanced immunotherapies abroad and why cross-border medical access matters."
    },
    {
        "pillar": "Inspiration & Hope",
        "prompt": "Write an uplifting post on the resilience of the human spirit in the face of rare disease diagnoses, focusing on the power of community, knowledge, and hope."
    },
    {
        "pillar": "Breakthrough Science",
        "prompt": "Write an educational post on Personalized Neoantigen Peptide Vaccines, explaining how DNA/RNA sequencing of tumors creates custom-tailored cancer vaccines."
    },
    {
        "pillar": "Patient Advocacy",
        "prompt": "Write a post on the importance of getting a second oncology opinion and molecular pathology review when diagnosed with a high-grade or rare tumor."
    },
    {
        "pillar": "Science & Biomarkers",
        "prompt": "Write an educational post explaining Liquid Biopsies (circulating tumor DNA / ctDNA) and how simple blood draws are helping detect residual disease earlier."
    }
]

SYSTEM_PROMPT = """You are the lead medical communications and patient advocacy director for 'RiseHope' (https://risehope.online), an international pediatric oncology and rare disease advocacy initiative.

YOUR GOAL:
Create rigorous, educational, factual, and dignified Facebook Page posts that explain advanced oncology science, clinical trial realities, and patient advocacy.

CRITICAL INVARIANTS:
1. STRICTLY ZERO EMOJIS. Do NOT use any emojis, symbols, or decorative icons anywhere in the post.
2. NO VIBE-CODED BUZZWORDS or marketing clichés (avoid words like "game-changer", "revolutionary", "dawn of a new era", "imagine", "power of", "beacon of hope", "elite army", "superheroes", "warriors").
3. Write in clear, dignified, authoritative English suitable for oncologists, clinical researchers, patients, and serious supporters.
4. Structure clearly:
   - Clear topic header.
   - 2-4 concise, informative paragraphs or bullet points explaining the concept.
   - A dignified statement on patient advocacy or caregiver solidarity.
   - 3-4 professional hashtags (always include #RiseHope).
5. Return ONLY the raw post content ready for Facebook publishing. Do NOT wrap in markdown code blocks or add meta commentary."""

def proof(token: str) -> str:
    return hmac.new(SECRET.encode("utf-8"), token.encode("utf-8"), hashlib.sha256).hexdigest()

def make_session() -> requests.Session:
    s = requests.Session()
    s.trust_env = False
    s.proxies = {"http": PROXY_URL, "https": PROXY_URL}
    s.headers.update({"User-Agent": "fb-ads-manager/0.8"})
    return s

def load_history() -> dict:
    if os.path.exists(HISTORY_PATH):
        try:
            with open(HISTORY_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"posts": [], "last_topic_index": -1}

def save_history(history: dict):
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(history, f, indent=2, ensure_ascii=False)

def generate_post_content() -> tuple[str, dict]:
    history = load_history()
    next_idx = (history.get("last_topic_index", -1) + 1) % len(TOPICS)
    topic = TOPICS[next_idx]
    
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "HTTP-Referer": "https://risehope.online",
        "X-Title": "RiseHope Facebook Auto-Poster",
        "Content-Type": "application/json"
    }

    last_few_posts = [p.get("message", "")[:80] for p in history.get("posts", [])[-4:]]
    avoid_context = f"\n\nRecently covered angles (do not repeat these exact openings): {last_few_posts}" if last_few_posts else ""

    payload = {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"{topic['prompt']}{avoid_context}"}
        ],
        "temperature": 0.75,
        "max_tokens": 750
    }

    content = None
    used_model = None

    for model in MODELS:
        payload["model"] = model
        try:
            r = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=30
            )
            if r.status_code == 200:
                data = r.json()
                content = data["choices"][0]["message"]["content"].strip()
                # Clean up any surrounding quotes or markdown code fence if present
                if content.startswith("```") and content.endswith("```"):
                    content = "\n".join(content.split("\n")[1:-1]).strip()
                used_model = model
                break
        except Exception as e:
            print(f"[Warning] OpenRouter error on {model}: {e}", file=sys.stderr)
            time.sleep(1)

    if not content:
        raise RuntimeError("Failed to generate post content from OpenRouter models.")

    topic_metadata = {
        "topic_index": next_idx,
        "pillar": topic["pillar"],
        "prompt": topic["prompt"],
        "model": used_model
    }
    return content, topic_metadata

def get_page_token() -> str:
    s = make_session()
    r = s.get(
        f"https://graph.facebook.com/{VERSION}/me/accounts",
        params={"fields": "id,name,access_token", "access_token": USER_TOKEN, "appsecret_proof": proof(USER_TOKEN)},
        timeout=30
    )
    if r.status_code == 200:
        data = r.json().get("data", [])
        for p in data:
            if str(p.get("id")) == str(PAGE_ID):
                return p.get("access_token")
    raise RuntimeError(f"Could not find Page Access Token for Page ID {PAGE_ID}")

def publish_to_facebook(message: str) -> dict:
    page_token = get_page_token()
    s = make_session()
    time.sleep(1.0 + random.uniform(0.2, 0.5))
    
    payload = {
        "access_token": page_token,
        "appsecret_proof": proof(page_token),
        "message": message,
        "published": "true"
    }
    r = s.post(
        f"https://graph.facebook.com/{VERSION}/{PAGE_ID}/feed",
        data=payload,
        timeout=30
    )
    return {"status_code": r.status_code, "body": r.json() if r.status_code == 200 else r.text}

def run_once(publish: bool = True):
    print(f"[{datetime.datetime.now().isoformat()}] Starting RiseHope Post Generation...")
    content, metadata = generate_post_content()
    print("\n--- GENERATED POST CONTENT ---")
    print(content)
    print("------------------------------\n")

    history = load_history()
    post_record = {
        "timestamp": datetime.datetime.now().isoformat(),
        "pillar": metadata["pillar"],
        "model": metadata["model"],
        "message": content
    }

    if publish:
        print(f"Publishing to Facebook Page ID {PAGE_ID} via Residential Proxy...")
        res = publish_to_facebook(content)
        print("Publish Response:", res)
        if res.get("status_code") == 200 and isinstance(res.get("body"), dict):
            post_id = res["body"].get("id")
            print(f"[SUCCESS] Post published live! Facebook Post ID: {post_id}")
            post_record["fb_post_id"] = post_id
            post_record["status"] = "published"
        else:
            print(f"[ERROR] Failed to publish post: {res}", file=sys.stderr)
            post_record["status"] = "failed"
            post_record["error"] = res
    else:
        print("[DRY RUN] Skipped publishing to Facebook.")
        post_record["status"] = "dry_run"

    history["last_topic_index"] = metadata["topic_index"]
    history["posts"].append(post_record)
    save_history(history)
    print("History updated successfully.")

def run_daemon(interval_hours: float = 12.0):
    print(f"[*] Starting RiseHope Auto-Poster Daemon (Posting every {interval_hours} hours)...")
    while True:
        try:
            run_once(publish=True)
        except Exception as e:
            print(f"[Daemon Error]: {e}", file=sys.stderr)
        
        sleep_sec = int(interval_hours * 3600) + random.randint(-120, 120)
        print(f"[*] Sleeping for {sleep_sec / 3600:.2f} hours until next post...")
        time.sleep(sleep_sec)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="RiseHope Facebook Auto-Poster")
    parser.add_argument("--publish", action="store_true", help="Generate and immediately publish to Facebook")
    parser.add_argument("--dry-run", action="store_true", help="Generate and print without publishing")
    parser.add_argument("--daemon", action="store_true", help="Run background daemon posting twice daily (12h interval)")
    parser.add_argument("--interval", type=float, default=12.0, help="Interval in hours for daemon mode (default: 12.0)")

    args = parser.parse_args()

    if args.daemon:
        run_daemon(interval_hours=args.interval)
    elif args.publish:
        run_once(publish=True)
    elif args.dry_run:
        run_once(publish=False)
    else:
        # Default dry run if no flag passed
        run_once(publish=False)
