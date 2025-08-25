#!/bin/bash

# Test script for all basic Deno commands with demo files
# Run this to verify everything works for your demo

echo "🚀 Testing Deno Commands with Demo Files"
echo "========================================="
echo ""

# Function to run command and check result
run_test() {
    echo "Testing: $1"
    if eval "$2" > /dev/null 2>&1; then
        echo "✅ $1 - SUCCESS"
    else
        echo "❌ $1 - FAILED"
        echo "   Command: $2"
    fi
    echo ""
}

# Test all basic commands
run_test "deno check" "deno check demo.ts"
run_test "deno fmt" "deno fmt --check demo.ts demo.test.ts demo.bench.ts"
run_test "deno lint" "deno lint demo.ts demo.test.ts"
run_test "deno run" "deno run demo.ts"
run_test "deno test" "deno test demo.test.ts"
run_test "deno bench" "deno bench demo.bench.ts"
run_test "deno info" "deno info demo.ts"
run_test "deno doc" "deno doc demo.ts"
run_test "deno cache" "deno cache demo.ts"
run_test "deno compile" "deno compile --output=temp-demo demo.ts && rm temp-demo"

echo "========================================="
echo "✨ All basic Deno commands tested!"
echo ""
echo "You can now demo these commands confidently:"
echo "  • deno check demo.ts"
echo "  • deno fmt demo.ts"
echo "  • deno lint demo.ts"
echo "  • deno run demo.ts"
echo "  • deno test demo.test.ts"
echo "  • deno bench demo.bench.ts"
echo "  • deno doc demo.ts"
echo "  • deno compile --output=demo-app demo.ts"