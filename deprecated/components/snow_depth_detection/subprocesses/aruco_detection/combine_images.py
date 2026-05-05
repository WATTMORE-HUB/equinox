#!/usr/bin/env python3

import os
from PIL import Image, ImageDraw, ImageFont
import math

def combine_images_to_printable_page():
    """Combine 16 PNG files into a single printable page with filenames."""
    
    # Get all PNG files and sort them naturally
    png_files = [f for f in os.listdir('.') if f.endswith('.png')]
    png_files.sort(key=lambda x: int(x.replace('marker', '').replace('.png', '')))
    
    if len(png_files) != 16:
        print(f"Warning: Found {len(png_files)} PNG files, expected 16")
    
    # Configuration
    grid_cols = 4
    grid_rows = 4
    cell_width = 400
    cell_height = 350
    margin = 20
    text_height = 40
    
    # Calculate canvas size for standard letter paper (8.5x11 inches at 300 DPI)
    canvas_width = 2550  # 8.5 * 300
    canvas_height = 3300  # 11 * 300
    
    # Create white canvas
    canvas = Image.new('RGB', (canvas_width, canvas_height), 'white')
    draw = ImageDraw.Draw(canvas)
    
    # Try to load a font, fall back to default if not available
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 24)
    except:
        try:
            font = ImageFont.truetype("arial.ttf", 24)
        except:
            font = ImageFont.load_default()
    
    # Calculate actual cell dimensions to fit on page
    available_width = canvas_width - (margin * 2)
    available_height = canvas_height - (margin * 2)
    
    actual_cell_width = available_width // grid_cols
    actual_cell_height = available_height // grid_rows
    
    # Process each image
    for idx, filename in enumerate(png_files[:16]):  # Limit to 16 images
        row = idx // grid_cols
        col = idx % grid_cols
        
        try:
            # Load and resize image
            img = Image.open(filename)
            
            # Calculate image dimensions (leave space for text)
            img_width = actual_cell_width - 20
            img_height = actual_cell_height - text_height - 20
            
            # Resize image while maintaining aspect ratio
            img.thumbnail((img_width, img_height), Image.Resampling.LANCZOS)
            
            # Calculate position to center the image in its cell
            cell_x = margin + col * actual_cell_width
            cell_y = margin + row * actual_cell_height
            
            img_x = cell_x + (actual_cell_width - img.width) // 2
            img_y = cell_y + 10
            
            # Paste image onto canvas
            if img.mode == 'RGBA':
                canvas.paste(img, (img_x, img_y), img)
            else:
                canvas.paste(img, (img_x, img_y))
            
            # Add filename text below image
            text_y = img_y + img.height + 10
            text_x = cell_x + actual_cell_width // 2
            
            # Get text bounding box for centering
            bbox = draw.textbbox((0, 0), filename, font=font)
            text_width = bbox[2] - bbox[0]
            text_x = text_x - text_width // 2
            
            draw.text((text_x, text_y), filename, fill='black', font=font)
            
        except Exception as e:
            print(f"Error processing {filename}: {e}")
            # Draw error placeholder
            cell_x = margin + col * actual_cell_width
            cell_y = margin + row * actual_cell_height
            draw.rectangle([cell_x + 10, cell_y + 10, 
                          cell_x + actual_cell_width - 10, 
                          cell_y + actual_cell_height - 10], 
                         outline='red', width=2)
            draw.text((cell_x + 20, cell_y + 20), f"Error: {filename}", fill='red', font=font)
    
    # Save the combined image
    output_filename = 'combined_markers.png'
    canvas.save(output_filename, 'PNG', dpi=(300, 300))
    print(f"Combined image saved as: {output_filename}")
    print(f"Canvas size: {canvas_width}x{canvas_height} pixels (8.5x11 inches at 300 DPI)")
    
    return output_filename

if __name__ == "__main__":
    combine_images_to_printable_page()