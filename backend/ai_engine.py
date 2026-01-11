"""
AI Engine for Blueprint Rendering

Uses Google Gemini 3 Pro Image model for transforming CAD wireframes
into professional architectural blueprints.

Supports:
- Image-to-image transformation (wireframe → blueprint)
- Context-aware prompting based on engineering specs
- Multiple rendering styles (blueprint, professional, sketch)
"""

import os
import io
from typing import Optional, Dict, Any, Literal
from PIL import Image
from dotenv import load_dotenv
from dataclasses import dataclass

# Load env in case this is run standalone
load_dotenv()


@dataclass
class RenderingStyle:
    """Rendering style configuration"""
    name: str
    background: str
    line_color: str
    accent_color: str
    description: str


# Pre-defined rendering styles
RENDERING_STYLES: Dict[str, RenderingStyle] = {
    "blueprint": RenderingStyle(
        name="Classic Blueprint",
        background="dark blue (#003366)",
        line_color="white/cyan",
        accent_color="light blue",
        description="Traditional blueprint style with white lines on dark blue background"
    ),
    "professional": RenderingStyle(
        name="Professional CAD",
        background="white",
        line_color="black",
        accent_color="red for dimensions",
        description="Clean professional CAD drawing suitable for construction documents"
    ),
    "sketch": RenderingStyle(
        name="Architectural Sketch",
        background="cream/off-white",
        line_color="dark gray",
        accent_color="sepia tones",
        description="Hand-drawn architectural sketch feel"
    ),
    "presentation": RenderingStyle(
        name="Presentation Quality",
        background="light gray gradient",
        line_color="dark gray",
        accent_color="accent colors for zones",
        description="High-quality presentation rendering with zone coloring"
    )
}


class GeminiClient:
    """
    Client for Google Gemini AI image generation.

    Uses the Gemini 3 Pro Image model for structure-guided image generation.
    """

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Gemini client.

        Args:
            api_key: Google AI API key. If not provided, reads from environment.
        """
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY") or os.getenv("GOOGLE_AI_API_KEY")
        if not self.api_key:
            raise ValueError(
                "Google AI API key not found. "
                "Set GOOGLE_API_KEY or GOOGLE_AI_API_KEY in your .env file."
            )

        # Import the google-genai SDK
        from google import genai

        # Create client with API key
        self.client = genai.Client(api_key=self.api_key)
        self.model_name = "gemini-2.0-flash-exp"  # Latest model with image generation

    def generate_blueprint_render(
        self,
        prompt: str,
        structure_image_path: str,
        style: str = "professional"
    ) -> Optional[bytes]:
        """
        Transform wireframe into professional blueprint using Gemini.

        Uses image-to-image capability where the wireframe serves as
        structural guidance for the generated blueprint.

        Args:
            prompt: Style and rendering instructions
            structure_image_path: Path to wireframe PNG
            style: Rendering style key

        Returns:
            Generated image as bytes, or None on failure
        """
        try:
            # Load the structure image
            input_image = Image.open(structure_image_path)

            # Get style configuration
            style_config = RENDERING_STYLES.get(style, RENDERING_STYLES["professional"])

            # Build comprehensive prompt
            full_prompt = self._build_comprehensive_prompt(prompt, style_config)

            # Call Gemini with image input
            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[full_prompt, input_image],
            )

            # Extract generated image from response
            return self._extract_image_from_response(response)

        except Exception as e:
            print(f"Error calling Gemini Image Generation: {e}")
            import traceback
            traceback.print_exc()
            return None

    def generate_engineering_blueprint(
        self,
        wireframe_path: str,
        engineering_context: Dict[str, Any],
        style: Literal["blueprint", "professional", "sketch", "presentation"] = "professional"
    ) -> Optional[bytes]:
        """
        Generate blueprint with full engineering context.

        This method accepts detailed engineering specifications and
        creates a context-aware rendering prompt.

        Args:
            wireframe_path: Path to CAD wireframe PNG
            engineering_context: Dict containing:
                - wall_system: Wall specifications
                - staircase: Staircase specifications
                - rooms: Room list with types and areas
                - materials: Construction materials
            style: Rendering style

        Returns:
            Generated blueprint as bytes
        """
        try:
            input_image = Image.open(wireframe_path)
            style_config = RENDERING_STYLES.get(style, RENDERING_STYLES["professional"])

            # Build engineering-aware prompt
            prompt = self._build_engineering_prompt(engineering_context, style_config)

            response = self.client.models.generate_content(
                model=self.model_name,
                contents=[prompt, input_image],
            )

            return self._extract_image_from_response(response)

        except Exception as e:
            print(f"Engineering blueprint generation failed: {e}")
            import traceback
            traceback.print_exc()
            return None

    def _build_comprehensive_prompt(
        self,
        base_prompt: str,
        style: RenderingStyle
    ) -> str:
        """
        Build comprehensive rendering prompt.

        Args:
            base_prompt: User-provided prompt
            style: Style configuration

        Returns:
            Full prompt string
        """
        return f"""Transform this architectural floor plan wireframe into a professional {style.name} rendering.

## Input
The input image is a precise CAD wireframe showing:
- Room layouts with labeled spaces
- Wall positions and thicknesses
- Door and window openings
- Dimension annotations
- Engineering symbols (stairs, shafts)

## Style: {style.name}
- Background: {style.background}
- Lines: {style.line_color}
- Accents: {style.accent_color}
- {style.description}

## Custom Instructions
{base_prompt}

## CRITICAL Requirements
1. **PRESERVE EXACT GEOMETRY**: Match room positions, sizes, and proportions exactly
2. **MAINTAIN LABELS**: Keep all room names and area annotations visible
3. **SHOW WALL THICKNESS**: Render walls with proper thickness representation
4. **ARCHITECTURAL SYMBOLS**:
   - Doors: Show swing arc direction
   - Stairs: Show step lines and UP/DOWN arrows
   - Plumbing shafts: Mark with P symbol
   - Ventilation: Mark with V symbol
5. **DIMENSIONS**: Include dimension lines in feet-inches format (e.g., 12'-6")
6. **SCALE BAR**: Add a scale reference
7. **NORTH ARROW**: Preserve north arrow orientation

## Quality Standards
- Resolution: High-quality, crisp lines
- Clarity: All text must be readable
- Professional: Suitable for construction documentation
- Clean: No artifacts or distortions

Generate the professional architectural blueprint now."""

    def _build_engineering_prompt(
        self,
        context: Dict[str, Any],
        style: RenderingStyle
    ) -> str:
        """
        Build prompt with engineering context.

        Args:
            context: Engineering specifications
            style: Style configuration

        Returns:
            Engineering-aware prompt
        """
        # Extract context elements
        wall_system = context.get("wall_system", {})
        staircase = context.get("staircase", {})
        rooms = context.get("rooms", [])
        materials = context.get("materials", [])

        # Build room summary
        room_summary = ""
        if rooms:
            room_list = [f"- {r.get('name', 'Room')}: {r.get('area_sqft', 0):.0f} sq.ft" for r in rooms]
            room_summary = "\n".join(room_list)

        # Build material context
        material_context = ""
        if wall_system.get("material"):
            material_context = f"Wall Construction: {wall_system['material']}"
        if materials:
            material_context += f"\nMaterials: {', '.join(materials)}"

        # Build staircase context
        stair_context = ""
        if staircase and staircase.get("type"):
            stair_context = f"""
Staircase: {staircase.get('type', 'straight').replace('-', ' ').title()}
- Width: {staircase.get('width_feet', 3.5)}'
- Riser: {staircase.get('riser_height_inches', 7)}"
- Tread: {staircase.get('tread_width_inches', 10)}"
"""

        return f"""Transform this engineering floor plan wireframe into a professional {style.name} architectural blueprint.

## Engineering Specifications

### Wall System
- External Walls: {wall_system.get('external_thickness_inches', 9)}" thick
- Internal Walls: {wall_system.get('internal_thickness_inches', 4.5)}" thick
{material_context}

### Load-Bearing Structure
Walls marked as load-bearing: {', '.join(wall_system.get('load_bearing_walls', [])) or 'None specified'}

{stair_context}

### Room Schedule
{room_summary or 'See wireframe for room layout'}

## Rendering Style: {style.name}
- Background: {style.background}
- Lines: {style.line_color}
- Accents: {style.accent_color}

## Tamil Nadu / Indian Construction Standards
- Follow NBC 2016 conventions
- Dimensions in feet-inches format (e.g., 15'-6")
- Room areas in square feet
- Standard architectural symbols per Indian drawing conventions

## CRITICAL Requirements
1. **EXACT GEOMETRY**: Preserve all room positions and dimensions precisely
2. **WALL REPRESENTATION**:
   - External walls: Bold lines
   - Internal walls: Medium lines
   - Load-bearing: Double lines or hatched
3. **ANNOTATIONS**:
   - Room names centered in each space
   - Area in sq.ft below room name
   - Dimension lines with proper tick marks
4. **SYMBOLS**:
   - Door swings with 90° arc
   - Staircase with step lines and arrow
   - Plumbing shaft: Rectangle with X
   - Ventilation: Rectangle with circle
5. **LEGEND**: Include brief symbol legend
6. **TITLE BLOCK**: Add space for title block (bottom right)

Generate the professional engineering blueprint now."""

    def _extract_image_from_response(self, response) -> Optional[bytes]:
        """
        Extract generated image from Gemini response.

        Args:
            response: Gemini API response

        Returns:
            Image bytes or None
        """
        try:
            for part in response.candidates[0].content.parts:
                if hasattr(part, 'text') and part.text:
                    print(f"Model text response: {part.text[:200]}...")

                if hasattr(part, 'inline_data') and part.inline_data:
                    # Extract image data
                    image_data = part.inline_data.data
                    if isinstance(image_data, str):
                        import base64
                        image_data = base64.b64decode(image_data)
                    return image_data

            # Try alternative extraction method
            if hasattr(response, 'parts'):
                for part in response.parts:
                    if hasattr(part, 'inline_data') and part.inline_data is not None:
                        generated_image = part.as_image()
                        buffer = io.BytesIO()
                        if hasattr(generated_image, 'save'):
                            try:
                                generated_image.save(buffer, format='PNG')
                            except TypeError:
                                generated_image.save(buffer)
                        else:
                            buffer.write(generated_image)
                        buffer.seek(0)
                        return buffer.getvalue()

            print("No image found in Gemini response")
            return None

        except Exception as e:
            print(f"Error extracting image from response: {e}")
            return None


class BlueprintStyler:
    """
    Utility class for applying post-processing styles to blueprints.

    Can be used to add consistent styling after AI generation.
    """

    @staticmethod
    def apply_blueprint_tint(image_bytes: bytes, tint_color: str = "#003366") -> bytes:
        """
        Apply blueprint blue tint to an image.

        Args:
            image_bytes: Input image
            tint_color: Hex color for tint

        Returns:
            Tinted image bytes
        """
        from PIL import Image, ImageOps
        import io

        img = Image.open(io.BytesIO(image_bytes))

        # Convert to grayscale
        gray = ImageOps.grayscale(img)

        # Invert (white lines on black)
        inverted = ImageOps.invert(gray)

        # Apply blue tint
        r, g, b = int(tint_color[1:3], 16), int(tint_color[3:5], 16), int(tint_color[5:7], 16)

        # Create RGB image with tint
        tinted = Image.merge('RGB', (
            inverted.point(lambda x: int(x * r / 255)),
            inverted.point(lambda x: int(x * g / 255)),
            inverted.point(lambda x: int(x * b / 255))
        ))

        output = io.BytesIO()
        tinted.save(output, format='PNG')
        return output.getvalue()

    @staticmethod
    def add_title_block(
        image_bytes: bytes,
        title: str = "FLOOR PLAN",
        project: str = "",
        date: str = "",
        scale: str = "1:100"
    ) -> bytes:
        """
        Add a title block to the blueprint.

        Args:
            image_bytes: Input image
            title: Drawing title
            project: Project name
            date: Date string
            scale: Scale notation

        Returns:
            Image with title block
        """
        from PIL import Image, ImageDraw, ImageFont
        import io

        img = Image.open(io.BytesIO(image_bytes))
        draw = ImageDraw.Draw(img)

        # Title block dimensions
        width, height = img.size
        block_height = 60
        block_y = height - block_height - 10

        # Draw title block background
        draw.rectangle(
            [(width - 300, block_y), (width - 10, height - 10)],
            fill='white',
            outline='black',
            width=2
        )

        # Add text (using default font)
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 12)
            font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 10)
        except:
            font = ImageFont.load_default()
            font_small = font

        draw.text((width - 290, block_y + 5), title, fill='black', font=font)
        draw.text((width - 290, block_y + 22), f"Project: {project}", fill='black', font=font_small)
        draw.text((width - 290, block_y + 37), f"Scale: {scale}", fill='black', font=font_small)
        draw.text((width - 150, block_y + 37), f"Date: {date}", fill='black', font=font_small)

        output = io.BytesIO()
        img.save(output, format='PNG')
        return output.getvalue()


if __name__ == "__main__":
    # Test the client
    try:
        client = GeminiClient()
        print("GeminiClient initialized successfully")
        print(f"Using model: {client.model_name}")

        # Test with a sample wireframe if it exists
        test_paths = [
            "output/engineering_wireframe.png",
            "wireframe.png",
            "temp_structure.png"
        ]

        test_path = None
        for path in test_paths:
            if os.path.exists(path):
                test_path = path
                break

        if test_path:
            print(f"\nTesting with: {test_path}")

            # Test basic render
            result = client.generate_blueprint_render(
                "Professional architectural blueprint with clean lines",
                test_path,
                style="professional"
            )

            if result:
                output_path = "test_ai_rendered.png"
                with open(output_path, "wb") as f:
                    f.write(result)
                print(f"AI rendered blueprint saved to: {output_path}")
            else:
                print("Failed to generate AI render")

            # Test engineering render
            engineering_context = {
                "wall_system": {
                    "external_thickness_inches": 9,
                    "internal_thickness_inches": 4.5,
                    "material": "Burnt clay brick masonry",
                    "load_bearing_walls": ["north-external", "south-external"]
                },
                "staircase": {
                    "type": "l-shaped",
                    "width_feet": 3.5,
                    "riser_height_inches": 7,
                    "tread_width_inches": 10
                },
                "rooms": [
                    {"name": "Living Room", "area_sqft": 180},
                    {"name": "Kitchen", "area_sqft": 80},
                    {"name": "Master Bedroom", "area_sqft": 150}
                ]
            }

            result2 = client.generate_engineering_blueprint(
                test_path,
                engineering_context,
                style="blueprint"
            )

            if result2:
                output_path2 = "test_engineering_blueprint.png"
                with open(output_path2, "wb") as f:
                    f.write(result2)
                print(f"Engineering blueprint saved to: {output_path2}")
        else:
            print("No test wireframe found. Generate one first with cad_engine.py")

    except Exception as e:
        print(f"Test failed: {e}")
        import traceback
        traceback.print_exc()
