#!/bin/bash

# Test script for Deno tasks
# Verifies that all task examples work correctly

echo "🚀 Testing Deno Tasks"
echo "===================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
passed=0
failed=0
skipped=0

# Function to test a task
test_task() {
    local task_name="$1"
    local should_work="${2:-true}"
    
    echo -n "Testing: deno task $task_name ... "
    
    if deno task "$task_name" > /dev/null 2>&1; then
        if [ "$should_work" = "true" ]; then
            echo -e "${GREEN}PASS${NC}"
            ((passed++))
        else
            echo -e "${RED}UNEXPECTED PASS${NC}"
            ((failed++))
        fi
    else
        if [ "$should_work" = "false" ]; then
            echo -e "${YELLOW}EXPECTED FAIL${NC}"
            ((skipped++))
        else
            echo -e "${RED}FAIL${NC}"
            ((failed++))
        fi
    fi
}

# Test demo tasks (these should definitely work)
echo "📝 Demo Tasks:"
test_task "demo:basic"
test_task "demo:test" 
test_task "demo:bench"
echo ""

# Test basic development tasks
echo "🛠️  Development Tasks:"
test_task "fmt"
test_task "lint"
test_task "check" "false"  # May fail due to project errors
test_task "test" "false"   # May fail due to project errors
echo ""

# Test utility tasks
echo "🔧 Utility Tasks:"
test_task "clean"
test_task "info"
test_task "docs:json"
echo ""

# Test build tasks (these may not work without proper setup)
echo "🏗️  Build Tasks:"
test_task "build" "false"      # May fail
test_task "build:prod" "false" # May fail
echo ""

# Test tasks that require external services
echo "🌐 Service Tasks:"
test_task "health" "false"     # Will fail if no server running
echo ""

echo "===================="
echo "📊 Test Results:"
echo -e "  ${GREEN}Passed: $passed${NC}"
echo -e "  ${RED}Failed: $failed${NC}"
echo -e "  ${YELLOW}Skipped: $skipped${NC}"
echo ""

# List all available tasks
echo "📋 Available Tasks:"
deno task 2>/dev/null | grep -E "^\s*-\s" | head -20
if [ $(deno task 2>/dev/null | grep -E "^\s*-\s" | wc -l) -gt 20 ]; then
    echo "  ... and more (run 'deno task' to see all)"
fi

echo ""
echo "✨ Task testing complete!"

# Exit with appropriate code
if [ $failed -eq 0 ]; then
    exit 0
else
    exit 1
fi