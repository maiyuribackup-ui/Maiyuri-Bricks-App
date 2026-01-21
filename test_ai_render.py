"""
Test script to run AI rendering on the uploaded floor plan.
"""
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

from dotenv import load_dotenv
load_dotenv()

from backend.ai_engine import GeminiClient

def test_ai_rendering():
    # Path to the uploaded image
    uploaded_image = "/Users/ramkumaranganeshan/.gemini/antigravity/brain/bae1e1d6-21de-49be-9536-2d6f55aca67a/uploaded_image_1768098396097.png"
    
    # Output path
    output_path = "/Users/ramkumaranganeshan/.gemini/antigravity/brain/bae1e1d6-21de-49be-9536-2d6f55aca67a/ai_rendered_blueprint.png"
    
    print("Initializing Gemini Client...")
    try:
        client = GeminiClient()
        print("✓ Client initialized")
    except Exception as e:
        print(f"✗ Failed to initialize client: {e}")
        return False
    
    print("\nSending floor plan to Gemini for AI rendering...")
    prompt = """
    This is a hand-drawn survey plot plan for a residential building.
    Convert this into a professional architectural blueprint with:
    - Clean, precise CAD-style lines
    - Professional blue blueprint background with white lines
    - Proper room labels and dimension annotations
    - Architectural symbols for doors, windows
    - The building should include: Living Room, Dining, Kitchen, Double Bedroom, Common Toilet, Staircase, Verandah
    - Maintain the exact proportions from the sketch
    """
    
    try:
        result = client.generate_blueprint_render(prompt, uploaded_image)
        
        if result:
            with open(output_path, "wb") as f:
                f.write(result)
            print(f"✓ AI rendered blueprint saved to: {output_path}")
            return True
        else:
            print("✗ No image returned from AI")
            return False
            
    except Exception as e:
        print(f"✗ Error during rendering: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_ai_rendering()
    sys.exit(0 if success else 1)
