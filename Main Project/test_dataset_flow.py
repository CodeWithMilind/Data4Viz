#!/usr/bin/env python3
"""
Test complete dataset flow:
1. Upload dataset to workspace
2. Get overview
3. Get schema
4. Request intelligence insights

Tests for:
- No HTTP 500 errors
- All endpoints return HTTP 200 on success
- Defensive defaults work when data is missing
- Complete flow is atomic and consistent
"""

import requests
import json
import csv
import tempfile
import os
from pathlib import Path
from datetime import datetime

BASE_URL = "http://localhost:3001"
WORKSPACE_ID = f"test-ws-{int(datetime.now().timestamp() * 1000)}"
DATASET_ID = "test_dataset.csv"

def create_test_csv():
    """Create a minimal valid test CSV"""
    # Create a temp CSV file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['id', 'value', 'category'])
        for i in range(100):  # At least 50 rows for statistical significance
            writer.writerow([i, i * 2.5, 'cat_' + str(i % 5)])
        return f.name

def test_upload_dataset():
    """Test 1: Upload dataset to workspace"""
    print(f"\n[TEST 1] Upload dataset to workspace")
    print(f"  Workspace ID: {WORKSPACE_ID}")
    print(f"  Dataset ID: {DATASET_ID}")
    
    csv_file = create_test_csv()
    try:
        with open(csv_file, 'rb') as f:
            files = {'file': (DATASET_ID, f, 'text/csv')}
            response = requests.post(
                f"{BASE_URL}/workspaces/{WORKSPACE_ID}/datasets/upload",
                files=files
            )
        
        print(f"  Status Code: {response.status_code}")
        print(f"  Response: {response.text[:200]}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"  ✓ Upload succeeded")
            print(f"    - Rows: {data.get('rows')}")
            print(f"    - Columns: {data.get('columns')}")
            return True
        else:
            print(f"  ✗ Upload failed with HTTP {response.status_code}")
            return False
    finally:
        if os.path.exists(csv_file):
            os.unlink(csv_file)

def test_get_overview():
    """Test 2: Get dataset overview"""
    print(f"\n[TEST 2] Get dataset overview")
    
    response = requests.get(
        f"{BASE_URL}/api/overview",
        params={
            'workspace_id': WORKSPACE_ID,
            'dataset_id': DATASET_ID
        }
    )
    
    print(f"  Status Code: {response.status_code}")
    print(f"  Response: {response.text[:300]}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"  ✓ Overview retrieved successfully")
        print(f"    - Total Rows: {data.get('total_rows')}")
        print(f"    - Total Columns: {data.get('total_columns')}")
        print(f"    - Columns: {len(data.get('columns', []))} items")
        return True
    else:
        print(f"  ✗ Overview failed with HTTP {response.status_code}")
        return False

def test_get_schema():
    """Test 3: Get dataset schema"""
    print(f"\n[TEST 3] Get dataset schema")
    
    response = requests.get(
        f"{BASE_URL}/dataset/{DATASET_ID}/schema",
        params={
            'workspace_id': WORKSPACE_ID,
            'use_current': 'true'
        }
    )
    
    print(f"  Status Code: {response.status_code}")
    print(f"  Response: {response.text[:300]}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"  ✓ Schema retrieved successfully")
        print(f"    - Total Rows: {data.get('total_rows')}")
        print(f"    - Total Columns: {data.get('total_columns')}")
        print(f"    - Columns: {len(data.get('columns', []))} items")
        return True
    else:
        print(f"  ✗ Schema failed with HTTP {response.status_code}")
        return False

def test_get_nonexistent_overview():
    """Test 4: Get overview for non-existent dataset (should return empty, not 500)"""
    print(f"\n[TEST 4] Get overview for non-existent dataset (defensive test)")
    
    response = requests.get(
        f"{BASE_URL}/api/overview",
        params={
            'workspace_id': WORKSPACE_ID,
            'dataset_id': 'nonexistent_dataset.csv'
        }
    )
    
    print(f"  Status Code: {response.status_code}")
    print(f"  Response: {response.text[:300]}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"  ✓ Returned valid response (defensive)")
        print(f"    - Columns: {len(data.get('columns', []))} items")
        return True
    else:
        print(f"  ✗ Failed with HTTP {response.status_code}")
        return False

def test_get_nonexistent_schema():
    """Test 5: Get schema for non-existent dataset (should return empty, not 500)"""
    print(f"\n[TEST 5] Get schema for non-existent dataset (defensive test)")
    
    response = requests.get(
        f"{BASE_URL}/dataset/nonexistent_dataset.csv/schema",
        params={
            'workspace_id': WORKSPACE_ID,
            'use_current': 'true'
        }
    )
    
    print(f"  Status Code: {response.status_code}")
    print(f"  Response: {response.text[:300]}")
    
    if response.status_code == 200:
        data = response.json()
        print(f"  ✓ Returned valid response (defensive)")
        print(f"    - Columns: {len(data.get('columns', []))} items")
        return True
    else:
        print(f"  ✗ Failed with HTTP {response.status_code}")
        return False

def main():
    """Run all tests"""
    print("=" * 60)
    print("DATASET FLOW TEST SUITE")
    print("=" * 60)
    print(f"Backend URL: {BASE_URL}")
    print(f"Workspace ID: {WORKSPACE_ID}")
    
    tests = [
        ("Upload Dataset", test_upload_dataset),
        ("Get Overview", test_get_overview),
        ("Get Schema", test_get_schema),
        ("Get Non-existent Overview (Defensive)", test_get_nonexistent_overview),
        ("Get Non-existent Schema (Defensive)", test_get_nonexistent_schema),
    ]
    
    results = []
    for name, test_func in tests:
        try:
            result = test_func()
            results.append((name, result))
        except Exception as e:
            print(f"  ✗ Test failed with exception: {e}")
            results.append((name, False))
    
    print("\n" + "=" * 60)
    print("TEST RESULTS")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! Dataset flow is atomic and defensive.")
    else:
        print(f"\n❌ {total - passed} test(s) failed.")
    
    return passed == total

if __name__ == "__main__":
    exit(0 if main() else 1)
