import json
import requests
import logging
import time
from typing import Optional, Dict, Any
from pathlib import Path

logger = logging.getLogger(__name__)

# Ollama configuration
OLLAMA_HOST = "http://ollama:11434"
OLLAMA_MODEL = "phi"  # Ultra-lightweight model for CM4
OLLAMA_TIMEOUT = 30  # seconds
OLLAMA_PULL_TIMEOUT = 120  # seconds for model pull

# Fallback mode: Use rule-based summaries if LLM unavailable
FALLBACK_MODE_ENABLED = True

# Monitoring cache path
MONITORING_CACHE_PATH = "/collect_data/monitoring_cache.json"


class LLMClient:
    def __init__(self):
        self.ollama_host = OLLAMA_HOST
        self.model = OLLAMA_MODEL
        self.is_available = False
        self.fallback_mode = False
        self._check_ollama_availability()
    
    def _check_ollama_availability(self):
        """Check if ollama is running and model is available"""
        try:
            # Check if ollama is reachable
            response = requests.get(
                f"{self.ollama_host}/api/tags",
                timeout=5
            )
            
            if response.status_code == 200:
                tags = response.json().get("models", [])
                model_names = [m.get("name", "").split(":")[0] for m in tags]
                
                if self.model in model_names:
                    self.is_available = True
                    self.fallback_mode = False
                    logger.info(f"LLM client ready: {self.model} model available")
                else:
                    logger.warning(f"Model {self.model} not found. Available: {model_names}")
                    self._try_pull_model()
            else:
                logger.warning(f"Ollama returned status {response.status_code}")
                self.fallback_mode = FALLBACK_MODE_ENABLED
        
        except requests.exceptions.ConnectionError:
            logger.warning("Ollama not reachable - using fallback mode")
            self.fallback_mode = FALLBACK_MODE_ENABLED
        except Exception as e:
            logger.error(f"Error checking ollama: {e}")
            self.fallback_mode = FALLBACK_MODE_ENABLED
    
    def _try_pull_model(self):
        """Try to pull the model if not available"""
        try:
            logger.info(f"Attempting to pull {self.model} model...")
            response = requests.post(
                f"{self.ollama_host}/api/pull",
                json={"name": self.model},
                timeout=OLLAMA_PULL_TIMEOUT
            )
            
            if response.status_code == 200:
                self.is_available = True
                self.fallback_mode = False
                logger.info(f"Successfully pulled {self.model} model")
            else:
                logger.error(f"Failed to pull model: {response.status_code}")
                self.fallback_mode = FALLBACK_MODE_ENABLED
        
        except Exception as e:
            logger.error(f"Error pulling model: {e}")
            self.fallback_mode = FALLBACK_MODE_ENABLED
    
    def _load_monitoring_cache(self) -> Dict[str, Any]:
        """Load latest monitoring data"""
        try:
            if Path(MONITORING_CACHE_PATH).exists():
                with open(MONITORING_CACHE_PATH, 'r') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Error loading monitoring cache: {e}")
        
        return {
            "containers": {},
            "errors_recent": [],
            "warnings_recent": []
        }
    
    def _construct_context(self) -> str:
        """Construct context from monitoring data for LLM"""
        cache = self._load_monitoring_cache()
        
        context = "Current System Status:\n"
        context += f"Containers Running: {len(cache.get('containers', {}))}\n"
        
        # Container status
        containers = cache.get("containers", {})
        if containers:
            context += "\nContainer Details:\n"
            for name, data in containers.items():
                status = data.get("status", "unknown")
                cpu = data.get("cpu_percent", "N/A")
                mem = data.get("memory_percent", "N/A")
                context += f"  - {name}: {status} (CPU: {cpu}, Memory: {mem})\n"
        
        # Recent errors
        errors = cache.get("errors_recent", [])
        if errors:
            context += f"\nRecent Errors ({len(errors)}):\n"
            for error in errors[:5]:
                context += f"  - {error}\n"
        
        # Recent warnings
        warnings = cache.get("warnings_recent", [])
        if warnings:
            context += f"\nRecent Warnings ({len(warnings)}):\n"
            for warning in warnings[:5]:
                context += f"  - {warning}\n"
        
        return context
    
    def _fallback_response(self, question: str) -> str:
        """Generate rule-based response when LLM is unavailable"""
        cache = self._load_monitoring_cache()
        
        question_lower = question.lower()
        containers = cache.get("containers", {})
        errors = cache.get("errors_recent", [])
        warnings = cache.get("warnings_recent", [])
        
        # Health check
        if "health" in question_lower or "status" in question_lower:
            if not errors and not warnings:
                return f"✓ System is healthy. {len(containers)} containers running."
            else:
                return f"⚠ System has issues: {len(errors)} errors, {len(warnings)} warnings"
        
        # Container count
        if "container" in question_lower or "service" in question_lower:
            return f"Currently running {len(containers)} containers: {', '.join(containers.keys())}"
        
        # Memory check
        if "memory" in question_lower or "ram" in question_lower:
            response = "Memory Usage:\n"
            for name, data in containers.items():
                response += f"  {name}: {data.get('memory_usage', 'N/A')} ({data.get('memory_percent', 'N/A')})\n"
            return response
        
        # CPU check
        if "cpu" in question_lower or "processor" in question_lower:
            response = "CPU Usage:\n"
            for name, data in containers.items():
                response += f"  {name}: {data.get('cpu_percent', 'N/A')}\n"
            return response
        
        # Errors
        if "error" in question_lower:
            if errors:
                return f"Found {len(errors)} errors:\n" + "\n".join(errors[:3])
            else:
                return "No recent errors detected."
        
        # Default response
        return f"System overview: {len(containers)} containers running. " \
               f"Errors: {len(errors)}, Warnings: {len(warnings)}"
    
    def query(self, question: str) -> str:
        """Query the LLM with a question about system health"""
        
        # Check if LLM is available
        if not self.is_available and not self.fallback_mode:
            self._check_ollama_availability()
        
        # Use fallback if LLM unavailable
        if self.fallback_mode or not self.is_available:
            logger.info(f"Using fallback mode for: {question}")
            return self._fallback_response(question)
        
        try:
            # Construct context from monitoring data
            context = self._construct_context()
            
            # Create prompt for LLM
            prompt = f"""{context}

User Question: {question}

Please provide a brief, helpful answer about the system status based on the information above. 
Be concise and focus on actionable insights. Keep response under 100 words."""
            
            # Query ollama
            response = requests.post(
                f"{self.ollama_host}/api/generate",
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "temperature": 0.3  # Lower temperature for more consistent responses
                },
                timeout=OLLAMA_TIMEOUT
            )
            
            if response.status_code == 200:
                result = response.json()
                answer = result.get("response", "").strip()
                logger.info(f"LLM response generated for: {question}")
                return answer
            else:
                logger.error(f"LLM query failed: {response.status_code}")
                return self._fallback_response(question)
        
        except requests.exceptions.Timeout:
            logger.warning("LLM query timeout - using fallback")
            return self._fallback_response(question)
        except Exception as e:
            logger.error(f"Error querying LLM: {e}")
            return self._fallback_response(question)
    
    def retry_model_load(self):
        """Retry loading model (called periodically)"""
        if not self.is_available:
            logger.info("Retrying ollama connection...")
            self._check_ollama_availability()


# Singleton instance
_llm_client = None


def get_llm_client() -> LLMClient:
    """Get or create LLM client instance"""
    global _llm_client
    if _llm_client is None:
        _llm_client = LLMClient()
    return _llm_client


if __name__ == "__main__":
    # Test script
    logging.basicConfig(level=logging.INFO)
    
    client = get_llm_client()
    
    test_questions = [
        "Are all services healthy?",
        "What's the memory usage?",
        "Any errors in the logs?",
        "How many containers are running?"
    ]
    
    for question in test_questions:
        print(f"\nQ: {question}")
        answer = client.query(question)
        print(f"A: {answer}\n")
        time.sleep(1)
