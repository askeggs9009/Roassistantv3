"""
Script to update all HTML files to use Liquid Glass theme and DotGrid background
Adds:
- GSAP CDN script
- liquid-glass.css and dot-grid.css
- Replaces particles-background.js with dot-grid-background.js
"""

import os
import re

# GSAP CDN (InertiaPlugin is included in the full GSAP package on CDN)
GSAP_SCRIPT = '    <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>\n'

# CSS files to add (before existing styles)
GLASS_CSS = '    <link rel="stylesheet" href="styles/liquid-glass.css">\n    <link rel="stylesheet" href="styles/dot-grid.css">\n'

# Script to replace
OLD_SCRIPT = 'particles-background.js'
NEW_SCRIPT = 'dot-grid-background.js'

def update_html_file(file_path):
    """Update a single HTML file with liquid glass theme"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        original_content = content
        changes_made = []

        # 1. Add GSAP script before </body> if not already present
        if 'gsap' not in content.lower():
            # Find the closing body tag
            body_close_pattern = r'(\s*)(</body>)'
            if re.search(body_close_pattern, content):
                # Add GSAP before ReactBits animations
                animation_pattern = r'(\s*<!-- ReactBits.*?Animations -->)'
                if re.search(animation_pattern, content):
                    content = re.sub(
                        animation_pattern,
                        f'{GSAP_SCRIPT}\\1',
                        content,
                        count=1
                    )
                    changes_made.append('Added GSAP CDN script')
                else:
                    # Fallback: add before </body>
                    content = re.sub(
                        body_close_pattern,
                        f'{GSAP_SCRIPT}\\1\\2',
                        content,
                        count=1
                    )
                    changes_made.append('Added GSAP CDN script (fallback)')

        # 2. Add liquid-glass.css and dot-grid.css if not present
        if 'liquid-glass.css' not in content:
            # Find the first CSS link tag and add before it
            css_pattern = r'(\s*<link rel="stylesheet" href="styles/)'
            if re.search(css_pattern, content):
                content = re.sub(
                    css_pattern,
                    f'{GLASS_CSS}\\1',
                    content,
                    count=1
                )
                changes_made.append('Added liquid-glass.css and dot-grid.css')

        # 3. Replace particles-background.js with dot-grid-background.js
        if OLD_SCRIPT in content:
            content = content.replace(
                f'js/animations/{OLD_SCRIPT}',
                f'js/animations/{NEW_SCRIPT}'
            )
            changes_made.append(f'Replaced {OLD_SCRIPT} with {NEW_SCRIPT}')

        # Write back if changes were made
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True, changes_made
        else:
            return False, ['No changes needed']

    except Exception as e:
        return False, [f'Error: {str(e)}']

def main():
    # Get all HTML files in the current directory
    html_files = [f for f in os.listdir('.') if f.endswith('.html')]

    print('='*70)
    print('Liquid Glass Theme Updater')
    print('='*70)
    print(f'Found {len(html_files)} HTML files')
    print()

    updated_count = 0
    skipped_count = 0

    for html_file in html_files:
        updated, changes = update_html_file(html_file)

        if updated:
            updated_count += 1
            print(f'[UPDATED] {html_file}')
            for change in changes:
                print(f'  - {change}')
        else:
            skipped_count += 1
            print(f'[SKIP] {html_file} - {changes[0]}')

    print()
    print('='*70)
    print(f'Successfully updated: {updated_count} files')
    print(f'Skipped: {skipped_count} files')
    print('='*70)

if __name__ == '__main__':
    main()
