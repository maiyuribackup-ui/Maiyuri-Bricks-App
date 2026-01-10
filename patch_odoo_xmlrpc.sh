#!/bin/bash
# Odoo 17 XML-RPC Authentication Patch
# Fixes: AttributeError: 'Request' object has no attribute 'session'

set -e

ODOO_FILE="/opt/odoo17/odoo/addons/website/models/res_users.py"
BACKUP_FILE="${ODOO_FILE}.bak.$(date +%Y%m%d_%H%M%S)"

echo "=== Odoo XML-RPC Authentication Patch ==="
echo ""

# Check if file exists
if [ ! -f "$ODOO_FILE" ]; then
    echo "ERROR: File not found: $ODOO_FILE"
    echo "Please verify your Odoo installation path."
    exit 1
fi

# Create backup
echo "1. Creating backup: $BACKUP_FILE"
cp "$ODOO_FILE" "$BACKUP_FILE"

# Check if already patched
if grep -q "hasattr(request, 'session')" "$ODOO_FILE"; then
    echo "File appears to already be patched. Exiting."
    exit 0
fi

# Apply patch using sed
echo "2. Applying patch..."

# The bug is in _get_login_domain method - it tries to access request.session
# We need to wrap the website lookup in a try-except or check for session

sed -i.tmp '
/def _get_login_domain/,/return \[/ {
    /website = self.env\[.website.\].get_current_website()/ {
        i\        # Patch: Handle XML-RPC requests without session
        i\        try:
        i\            from odoo.http import request as http_request
        i\            if http_request and hasattr(http_request, '\''session'\''):
        s/website = self.env\[.website.\].get_current_website()/                website = self.env['\''website'\''].get_current_website()/
        a\            else:
        a\                website = None
        a\        except Exception:
        a\            website = None
    }
}
' "$ODOO_FILE"

# Remove temp file
rm -f "${ODOO_FILE}.tmp"

echo "3. Verifying patch..."
if grep -q "hasattr(http_request, 'session')" "$ODOO_FILE"; then
    echo "   Patch applied successfully!"
else
    echo "   WARNING: Patch may not have applied correctly."
    echo "   Manual patching may be required."
fi

echo ""
echo "4. Restarting Odoo service..."
if systemctl is-active --quiet odoo; then
    systemctl restart odoo
    echo "   Odoo restarted successfully!"
elif systemctl is-active --quiet odoo17; then
    systemctl restart odoo17
    echo "   Odoo17 restarted successfully!"
else
    echo "   Could not find Odoo service. Please restart manually:"
    echo "   sudo systemctl restart odoo"
fi

echo ""
echo "=== Patch Complete ==="
echo "Backup saved to: $BACKUP_FILE"
echo ""
echo "Test the connection with:"
echo "  curl -s -X POST 'https://CRM.MAIYURI.COM/xmlrpc/2/common' \\"
echo "    -H 'Content-Type: text/xml' \\"
echo "    -d '<?xml version=\"1.0\"?><methodCall><methodName>authenticate</methodName><params><param><value><string>lite2</string></value></param><param><value><string>maiyuribricks@gmail.com</string></value></param><param><value><string>YOUR_PASSWORD</string></value></param><param><value><struct></struct></value></param></params></methodCall>'"
