import requests
import sys
import json
from datetime import datetime

class FIEPPurchaseOrderTester:
    def __init__(self, base_url="https://purchase-order-sys-2.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.created_po_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=headers)

            print(f"   Status Code: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    if isinstance(response_data, dict) and len(str(response_data)) < 500:
                        print(f"   Response: {response_data}")
                    elif isinstance(response_data, list):
                        print(f"   Response: List with {len(response_data)} items")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"   Error: {error_detail}")
                except:
                    print(f"   Error: {response.text}")
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_dashboard_stats(self):
        """Test dashboard statistics endpoint"""
        success, response = self.run_test(
            "Dashboard Stats",
            "GET",
            "dashboard",
            200
        )
        
        if success:
            required_fields = ['total_ocs', 'total_items', 'items_pendentes', 'items_cotados', 
                             'items_comprados', 'items_entregues', 'items_por_responsavel']
            for field in required_fields:
                if field not in response:
                    print(f"❌ Missing field in dashboard response: {field}")
                    return False
            
            # Check if responsaveis are present
            responsaveis = response.get('items_por_responsavel', {})
            expected_responsaveis = ['Maria', 'Mateus', 'João', 'Mylena', 'Fabio']
            for resp in expected_responsaveis:
                if resp not in responsaveis:
                    print(f"❌ Missing responsavel in dashboard: {resp}")
                    return False
            
            print(f"✅ Dashboard structure validated - {len(responsaveis)} responsaveis found")
        
        return success

    def test_create_purchase_order(self):
        """Test creating a new purchase order"""
        po_data = {
            "numero_oc": f"OC-TEST-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
            "items": [
                {
                    "codigo_item": "107712",
                    "quantidade": 5
                },
                {
                    "codigo_item": "114510", 
                    "quantidade": 3
                }
            ]
        }
        
        success, response = self.run_test(
            "Create Purchase Order",
            "POST",
            "purchase-orders",
            200,
            data=po_data
        )
        
        if success:
            # Store PO ID for later tests
            self.created_po_id = response.get('id')
            print(f"✅ Created PO with ID: {self.created_po_id}")
            
            # Validate automatic assignment
            items = response.get('items', [])
            for item in items:
                if item['codigo_item'] in ['107712', '114510']:
                    if not item.get('responsavel'):
                        print(f"❌ Item {item['codigo_item']} missing responsavel assignment")
                        return False
                    if not item.get('lote'):
                        print(f"❌ Item {item['codigo_item']} missing lote assignment")
                        return False
                    print(f"✅ Item {item['codigo_item']} assigned to {item['responsavel']} (Lote: {item['lote']})")
        
        return success

    def test_list_purchase_orders(self):
        """Test listing purchase orders"""
        success, response = self.run_test(
            "List Purchase Orders",
            "GET",
            "purchase-orders",
            200
        )
        
        if success and isinstance(response, list):
            print(f"✅ Retrieved {len(response)} purchase orders")
            
            # Check if our created PO is in the list
            if self.created_po_id:
                found_po = any(po.get('id') == self.created_po_id for po in response)
                if found_po:
                    print(f"✅ Created PO found in list")
                else:
                    print(f"❌ Created PO not found in list")
                    return False
        
        return success

    def test_get_purchase_order_details(self):
        """Test getting specific purchase order details"""
        if not self.created_po_id:
            print("❌ No PO ID available for detail test")
            return False
            
        success, response = self.run_test(
            "Get PO Details",
            "GET",
            f"purchase-orders/{self.created_po_id}",
            200
        )
        
        if success:
            if response.get('id') == self.created_po_id:
                print(f"✅ PO details retrieved correctly")
                items = response.get('items', [])
                print(f"✅ PO has {len(items)} items")
            else:
                print(f"❌ Wrong PO returned")
                return False
        
        return success

    def test_update_item_status(self):
        """Test updating item status and prices"""
        if not self.created_po_id:
            print("❌ No PO ID available for item update test")
            return False
            
        # Test updating first item to "cotado" status with prices
        update_data = {
            "status": "cotado",
            "preco_compra": 100.50,
            "preco_venda": 150.75,
            "imposto": 15.00,
            "custo_frete": 10.25
        }
        
        success, response = self.run_test(
            "Update Item Status",
            "PATCH",
            f"purchase-orders/{self.created_po_id}/items/107712",
            200,
            data=update_data
        )
        
        if success:
            print(f"✅ Item status updated successfully")
            
            # Verify the update by getting PO details
            verify_success, po_details = self.run_test(
                "Verify Item Update",
                "GET",
                f"purchase-orders/{self.created_po_id}",
                200
            )
            
            if verify_success:
                items = po_details.get('items', [])
                updated_item = next((item for item in items if item['codigo_item'] == '107712'), None)
                
                if updated_item:
                    if updated_item['status'] == 'cotado':
                        print(f"✅ Item status correctly updated to 'cotado'")
                    if updated_item.get('lucro_liquido') is not None:
                        print(f"✅ Lucro líquido calculated: {updated_item['lucro_liquido']}")
                    if updated_item.get('data_cotacao'):
                        print(f"✅ Data cotação set: {updated_item['data_cotacao']}")
                else:
                    print(f"❌ Updated item not found")
                    return False
        
        return success

    def test_admin_summary(self):
        """Test admin summary endpoint"""
        success, response = self.run_test(
            "Admin Summary",
            "GET",
            "admin/summary",
            200
        )
        
        if success and isinstance(response, list):
            print(f"✅ Admin summary retrieved with {len(response)} items")
            
            # Check if our updated item appears in summary
            if response:
                sample_item = response[0]
                required_fields = ['numero_oc', 'codigo_item', 'nome_item', 'quem_cotou', 'status']
                for field in required_fields:
                    if field not in sample_item:
                        print(f"❌ Missing field in admin summary: {field}")
                        return False
                print(f"✅ Admin summary structure validated")
        
        return success

    def test_duplicate_items(self):
        """Test duplicate items detection"""
        success, response = self.run_test(
            "Duplicate Items Detection",
            "GET",
            "items/duplicates",
            200
        )
        
        if success:
            if 'total_duplicados' in response and 'duplicados' in response:
                print(f"✅ Duplicate detection working - {response['total_duplicados']} duplicates found")
            else:
                print(f"❌ Invalid duplicate response structure")
                return False
        
        return success

    def test_reference_items(self):
        """Test reference items endpoint"""
        success, response = self.run_test(
            "Reference Items",
            "GET",
            "reference-items",
            200
        )
        
        if success and isinstance(response, list):
            print(f"✅ Reference items retrieved - {len(response)} items in database")
            
            # Test specific item lookup
            success2, response2 = self.run_test(
                "Reference Item by Code",
                "GET",
                "reference-items",
                200,
                params={"codigo": "107712"}
            )
            
            if success2 and isinstance(response2, list):
                if response2:
                    item = response2[0]
                    print(f"✅ Found reference item 107712: {item.get('descricao', 'No description')}")
                    print(f"   Lote: {item.get('lote')}, Responsável: {item.get('responsavel')}")
                else:
                    print(f"❌ Reference item 107712 not found")
                    return False
        
        return success

def main():
    print("🚀 Starting FIEP Purchase Order System API Tests")
    print("=" * 60)
    
    tester = FIEPPurchaseOrderTester()
    
    # Run all tests in sequence
    tests = [
        ("Reference Items", tester.test_reference_items),
        ("Dashboard Stats", tester.test_dashboard_stats),
        ("Create Purchase Order", tester.test_create_purchase_order),
        ("List Purchase Orders", tester.test_list_purchase_orders),
        ("Get PO Details", tester.test_get_purchase_order_details),
        ("Update Item Status", tester.test_update_item_status),
        ("Admin Summary", tester.test_admin_summary),
        ("Duplicate Items", tester.test_duplicate_items),
    ]
    
    for test_name, test_func in tests:
        print(f"\n{'='*20} {test_name} {'='*20}")
        try:
            test_func()
        except Exception as e:
            print(f"❌ Test {test_name} failed with exception: {str(e)}")
    
    # Print final results
    print(f"\n{'='*60}")
    print(f"📊 FINAL RESULTS")
    print(f"Tests passed: {tester.tests_passed}/{tester.tests_run}")
    print(f"Success rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%" if tester.tests_run > 0 else "No tests run")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print("❌ Some tests failed!")
        return 1

if __name__ == "__main__":
    sys.exit(main())