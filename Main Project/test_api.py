#!/usr/bin/env python
"""Test the decision-eda API endpoint"""

import requests
import json
import sys

# Test backend health
print("Testing backend health...")
try:
    r = requests.get('http://localhost:3001/health', timeout=5)
    print(f"✓ Backend health: {r.status_code} - {r.json()}")
except Exception as e:
    print(f"✗ Backend health failed: {e}")
    sys.exit(1)

# Test frontend can reach API
print("\nTesting frontend API route...")
try:
    # Test with minimal required params
    payload = {
        "workspaceId": "test-workspace",
        "datasetId": "test-dataset",
        "decisionMetric": "price",
        "provider": "groq",
        "model": "mixtral-8x7b-32768",
        "apiKey": "test-key"
    }
    
    r = requests.post('http://localhost:3000/api/decision-eda', json=payload, timeout=10)
    print(f"Frontend API response status: {r.status_code}")
    
    if r.status_code == 200:
        print("✓ No ECONNREFUSED - API route working!")
        print(f"Response: {r.json()}")
    else:
        print(f"Response: {r.text[:200]}")
        
except requests.exceptions.ConnectionError as e:
    print(f"✗ ECONNREFUSED - {e}")
    sys.exit(1)
except Exception as e:
    print(f"Response error: {e}")
    # This is ok - we just want to avoid ECONNREFUSED
    print("✓ No ECONNREFUSED (other error is ok for this test)")

print("\n✓ Fix verified - no ECONNREFUSED errors!")
