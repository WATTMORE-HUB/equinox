#!/usr/bin/env python3

import os
from PIL import Image, ImageDraw, ImageFont

def create_page_with_4_images(png_files, page_num, start_idx):
    """Create a single page with 4 images arranged in a 2x2 grid."""
    
    # Configuration for 4 images (2 columns, 2 rows)
    grid_cols = 2
    grid_rows = 2
    margin = 40
    text_height = 60
    
    # Larger canvas to accommodate 3x bigger images (approximately 12x18 inches at 300 DPI)
    canvas_width = 3600  # 12 * 300
    canvas_height = 5400  # 18 * 300
    
    # Create white canvas
    canvas = Image.new('RGB', (canvas_width, canvas_height), 'white')
    draw = ImageDraw.Draw(canvas)
    
    # Load font
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 36)
    except:
        try:
            font = ImageFont.truetype("arial.ttf", 36)
        except:
            font = ImageFont.load_default()
    
    # Calculate cell dimensions
    available_width = canvas_width - (margin * 2)
    available_height = canvas_height - (margin * 2)
    
    cell_width = available_width // grid_cols
    cell_height = available_height // grid_rows
    
    # Add page title
    title = f"Marker Images - Page {page_num} (Markers {start_idx + 1}-{start_idx + 4})"
    title_bbox = draw.textbbox((0, 0), title, font=font)
    title_width = title_bbox[2] - title_bbox[0]
    title_x = (canvas_width - title_width) // 2
    draw.text((title_x, 30), title, fill='black', font=font)
    
    # Adjust for title space
    available_height -= 100
    cell_height = available_height // grid_rows
    start_y = margin + 100
    
    # Process 4 images for this page
    for i in range(4):
        if start_idx + i >= len(png_files):
            break
            
        filename = png_files[start_idx + i]
        row = i // grid_cols
        col = i % grid_cols
        
        try:
            # Load image
            img = Image.open(filename)
            
            # Calculate maximum image size (3x larger as requested)
            max_img_width = cell_width - 40  # Reduce margins to fit larger images
            max_img_height = cell_height - text_height - 40
            
            # Resize image while maintaining aspect ratio
            img.thumbnail((max_img_width, max_img_height), Image.Resampling.LANCZOS)
            
            # Calculate position to center the image in its cell
            cell_x = margin + col * cell_width
            cell_y = start_y + row * cell_height
            
            img_x = cell_x + (cell_width - img.width) // 2
            img_y = cell_y + 20
            
            # Paste image onto canvas
            if img.mode == 'RGBA':
                canvas.paste(img, (img_x, img_y), img)
            else:
                canvas.paste(img, (img_x, img_y))
            
            # Add filename text below image
            text_y = img_y + img.height + 20
            text_x = cell_x + cell_width // 2
            
            # Center the text
            bbox = draw.textbbox((0, 0), filename, font=font)
            text_width = bbox[2] - bbox[0]
            text_x = text_x - text_width // 2
            
            draw.text((text_x, text_y), filename, fill='black', font=font)
            
        except Exception as e:
            print(f"Error processing {filename}: {e}")
            # Draw error placeholder
            cell_x = margin + col * cell_width
            cell_y = start_y + row * cell_height
            draw.rectangle([cell_x + 30, cell_y + 30, 
                          cell_x + cell_width - 30, 
                          cell_y + cell_height - 30], 
                         outline='red', width=3)
            draw.text((cell_x + 50, cell_y + 50), f"Error: {filename}", fill='red', font=font)
    
    return canvas

def create_4_pages():
    """Create 4 separate PNG files, each with 4 marker images."""
    
    # Get marker PNG files and sort them
    png_files = [f for f in os.listdir('.') if f.endswith('.png') and f.startswith('marker') and f.replace('marker', '').replace('.png', '').isdigit()]
    png_files.sort(key=lambda x: int(x.replace('marker', '').replace('.png', '')))
    
    print(f"Found {len(png_files)} marker PNG files")
    
    if len(png_files) != 16:
        print(f"Warning: Expected 16 files, found {len(png_files)}")
    
    created_files = []
    
    # Create 4 pages with 4 images each
    for page_num in range(1, 5):
        start_idx = (page_num - 1) * 4
        
        if start_idx >= len(png_files):
            break
            
        page = create_page_with_4_images(png_files, page_num, start_idx)
        
        filename = f'markers_page_{page_num}.png'
        page.save(filename, 'PNG', dpi=(300, 300))
        
        end_marker = min(start_idx + 4, len(png_files))
        print(f"Created {filename} with markers {start_idx + 1}-{end_marker}")
        created_files.append(filename)
    
    return created_files

if __name__ == "__main__":
    files = create_4_pages()
    print(f"\nCreated {len(files)} pages:")
    for f in files:
        print(f"  {f}")
    print("\nEach page is 12x18 inches at 300 DPI with 4 much larger images (2x2 grid).")
    print("Each image is now 3x larger as requested!")
