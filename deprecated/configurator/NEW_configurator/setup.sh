#!/bin/bash

echo "🚀 Setting up EnForm CSV Configurator..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first:"
    echo "   https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js found: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ npm found: $(npm --version)"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
if npm install express cors; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "To start the configurator:"
echo "  npm start"
echo ""
echo "Then open your browser to:"
echo "  http://localhost:3001/index.html"
echo ""
echo "To create projects from command line:"
echo "  node create-project.js <project-name> [service1,service2,...]"
echo ""