#!/usr/bin/env python3

import os
from PIL import Image, ImageDraw, ImageFont

def create_page_with_images(png_files, page_num, start_idx=0, images_per_page=8):
    """Create a single page with up to 8 images arranged in a 4x2 grid."""
    
    # Configuration for 8 images (4 columns, 2 rows) - doubled size
    grid_cols = 4
    grid_rows = 2
    margin = 20
    text_height = 60
    
    # Calculate canvas size for larger format (11x17 inches at 300 DPI for bigger images)
    canvas_width = 3300  # 11 * 300
    canvas_height = 5100  # 17 * 300
    
    # Create white canvas
    canvas = Image.new('RGB', (canvas_width, canvas_height), 'white')
    draw = ImageDraw.Draw(canvas)
    
    # Try to load a font, fall back to default if not available
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Arial.ttf", 40)
    except:
        try:
            font = ImageFont.truetype("arial.ttf", 40)
        except:
            font = ImageFont.load_default()
    
    # Calculate actual cell dimensions to fit on page
    available_width = canvas_width - (margin * 2)
    available_height = canvas_height - (margin * 2)
    
    actual_cell_width = available_width // grid_cols
    actual_cell_height = available_height // grid_rows
    
    # Add page title
    title = f"Marker Images - Page {page_num}"
    title_bbox = draw.textbbox((0, 0), title, font=font)
    title_width = title_bbox[2] - title_bbox[0]
    title_x = (canvas_width - title_width) // 2
    draw.text((title_x, 20), title, fill='black', font=font)
    
    # Adjust available height for title
    available_height -= 80
    actual_cell_height = available_height // grid_rows
    start_y = margin + 80
    
    # Process each image for this page
    end_idx = min(start_idx + images_per_page, len(png_files))
    
    for i, idx in enumerate(range(start_idx, end_idx)):
        filename = png_files[idx]
        row = i // grid_cols
        col = i % grid_cols
        
        try:
            # Load and resize image
            img = Image.open(filename)
            
            # Calculate image dimensions (leave space for text) - doubled size
            img_width = actual_cell_width - 30
            img_height = actual_cell_height - text_height - 30
            
            # Resize image while maintaining aspect ratio
            img.thumbnail((img_width, img_height), Image.Resampling.LANCZOS)
            
            # Calculate position to center the image in its cell
            cell_x = margin + col * actual_cell_width
            cell_y = start_y + row * actual_cell_height
            
            img_x = cell_x + (actual_cell_width - img.width) // 2
            img_y = cell_y + 20
            
            # Paste image onto canvas
            if img.mode == 'RGBA':
                canvas.paste(img, (img_x, img_y), img)
            else:
                canvas.paste(img, (img_x, img_y))
            
            # Add filename text below image
            text_y = img_y + img.height + 15
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
            cell_y = start_y + row * actual_cell_height
            draw.rectangle([cell_x + 20, cell_y + 20, 
                          cell_x + actual_cell_width - 20, 
                          cell_y + actual_cell_height - 20], 
                         outline='red', width=2)
            draw.text((cell_x + 30, cell_y + 30), f"Error: {filename}", fill='red', font=font)
    
    return canvas

def combine_images_8_per_page(create_separate_files=True):
    """Combine 16 PNG files into pages with 8 images each."""
    
    # Get all PNG files and sort them naturally
    png_files = [f for f in os.listdir('.') if f.endswith('.png') and f.startswith('marker') and f.replace('marker', '').replace('.png', '').isdigit()]
    png_files.sort(key=lambda x: int(x.replace('marker', '').replace('.png', '')))
    
    print(f"Found {len(png_files)} PNG files")
    
    if create_separate_files:
        # Create two separate image files
        page1 = create_page_with_images(png_files, 1, start_idx=0, images_per_page=8)
        page2 = create_page_with_images(png_files, 2, start_idx=8, images_per_page=8)
        
        # Save separate pages
        page1_filename = 'markers_page1.png'
        page2_filename = 'markers_page2.png'
        
        page1.save(page1_filename, 'PNG', dpi=(300, 300))
        page2.save(page2_filename, 'PNG', dpi=(300, 300))
        
        print(f"Created separate files:")
        print(f"  {page1_filename} (markers 1-8)")
        print(f"  {page2_filename} (markers 9-16)")
        
        return [page1_filename, page2_filename]
    
    else:
        # Create one tall image with both pages
        page1 = create_page_with_images(png_files, 1, start_idx=0, images_per_page=8)
        page2 = create_page_with_images(png_files, 2, start_idx=8, images_per_page=8)
        
        # Create a combined canvas (two pages stacked vertically)
        combined_width = page1.width
        combined_height = page1.height + page2.height + 100  # Add some spacing
        
        combined = Image.new('RGB', (combined_width, combined_height), 'white')
        combined.paste(page1, (0, 0))
        combined.paste(page2, (0, page1.height + 100))
        
        # Add page break line
        draw = ImageDraw.Draw(combined)
        y_line = page1.height + 50
        draw.line([(100, y_line), (combined_width - 100, y_line)], fill='gray', width=3)
        
        # Save combined file
        combined_filename = 'markers_two_pages.png'
        combined.save(combined_filename, 'PNG', dpi=(300, 300))
        
        print(f"Created two-page file: {combined_filename}")
        return [combined_filename]

if __name__ == "__main__":
    print("Choose an option:")
    print("1. Create two separate image files (recommended for printing)")
    print("2. Create one tall image with both pages")
    
    choice = input("Enter your choice (1 or 2): ").strip()
    
    if choice == "1":
        files = combine_images_8_per_page(create_separate_files=True)
    elif choice == "2":
        files = combine_images_8_per_page(create_separate_files=False)
    else:
        print("Creating separate files by default...")
        files = combine_images_8_per_page(create_separate_files=True)
    
    print("\nDone! Each page is 11x17 inches at 300 DPI (tabloid size).")
    print("Images are now much larger and easier to see!")
