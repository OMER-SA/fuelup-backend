import 'package:diet_app/components/checkout/payment_error_dialog.dart';
import 'package:diet_app/components/loading.dart';
import 'package:diet_app/firebase/db_service.dart';
import 'package:diet_app/firebase/realtime_database.dart';
import 'package:diet_app/providers/cart_provider.dart';
import 'package:diet_app/providers/customer_provider.dart';
import 'package:diet_app/providers/user_provider.dart';
import 'package:diet_app/utilities/backend_api.dart';
import 'package:diet_app/utilities/constants.dart';
import 'package:flutter/material.dart';
import 'package:flutter_credit_card/flutter_credit_card.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  final _formKey = GlobalKey<FormState>();
  final GlobalKey<FormState> _creditCardFormKey = GlobalKey<FormState>();
  final DBService _dbService = DBService();
  final RealDataBaseService _realDataBaseService = RealDataBaseService();

  bool isLoading = false;
  bool useGlassMorphism = false;

  late TextEditingController _nameController;
  late TextEditingController _addressController;
  late TextEditingController _phoneController;
  String? _selectedPaymentMethod; // Set to null initially
  bool paymentMethodError = false; // Add error flag for validation

  // Credit Card Form Fields
  String cardNumber = '';
  String expiryDate = '';
  String cardHolderName = '';
  String cvvCode = '';
  bool isCvvFocused = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final customerProvider =
        Provider.of<CustomerProvider>(context, listen: false);
    _nameController = TextEditingController(
      text:
          '${customerProvider.getFirstName ?? ''} ${customerProvider.getLastName ?? ''}'
              .trim(),
    );
    _addressController =
        TextEditingController(text: customerProvider.getAddress ?? '');
    _phoneController =
        TextEditingController(text: customerProvider.getPhone ?? '');
  }

  @override
  void dispose() {
    _nameController.dispose();
    _addressController.dispose();
    _phoneController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final cartProvider = Provider.of<CartProvider>(context);
    final defaultColors = DefaultColors();

    return Scaffold(
      resizeToAvoidBottomInset: false,
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(22.0),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Order Summary',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 16),
                // List of cart items
                ...cartProvider.cartItems.value.map((item) => ListTile(
                      title: Text(item.name),
                      subtitle: Text('Quantity: ${item.quantity}'),
                      trailing: Text(
                          '${(item.price * item.quantity).toStringAsFixed(2)} Rs'),
                    )),
                ListTile(
                  title: const Text(
                    'Delivery Charges',
                  ),
                  trailing: Text(
                    cartProvider.getDeliveryCharges.toString(),
                  ),
                ),
                const Divider(),
                ListTile(
                  title: const Text('Total',
                      style: TextStyle(fontWeight: FontWeight.bold)),
                  trailing: Text(cartProvider.getSubTotal().toStringAsFixed(2),
                      style: const TextStyle(fontWeight: FontWeight.bold)),
                ),
                const SizedBox(height: 24),
                Text('Delivery Information',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _nameController,
                  decoration: const InputDecoration(labelText: 'Full Name'),
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return 'Please enter your name';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _addressController,
                  decoration: const InputDecoration(labelText: 'Address'),
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return 'Please enter your address';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _phoneController,
                  decoration: const InputDecoration(labelText: 'Phone Number'),
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return 'Please enter your phone number';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 24),
                Text('Payment Method',
                    style: Theme.of(context).textTheme.titleLarge),
                const SizedBox(height: 16),
                ListTile(
                  title:
                      Text(_selectedPaymentMethod ?? 'Select Payment Method'),
                  trailing: const Icon(
                    Icons.arrow_forward_ios,
                    size: 18,
                  ),
                  onTap: _showPaymentMethodBottomSheet,
                ),
                // Show an error if no payment method is selected
                if (paymentMethodError)
                  const Padding(
                    padding: EdgeInsets.only(top: 8.0),
                    child: Text('Please select a payment method',
                        style: TextStyle(color: Colors.red)),
                  ),
                const SizedBox(height: 24),
                // Show Credit Card form if "Card Payment" is selected
                if (_selectedPaymentMethod == 'Card Payment') ...[
                  CreditCardWidget(
                    glassmorphismConfig:
                        useGlassMorphism ? Glassmorphism.defaultConfig() : null,
                    cardNumber: cardNumber,
                    expiryDate: expiryDate,
                    cardHolderName: cardHolderName,
                    cvvCode: cvvCode,
                    showBackView: isCvvFocused,
                    obscureCardNumber: true,
                    obscureCardCvv: true,
                    isHolderNameVisible: true,
                    cardBgColor: defaultColors.primaryColor,
                    onCreditCardWidgetChange:
                        (CreditCardBrand creditCardBrand) {},
                    customCardTypeIcons: [
                      CustomCardTypeIcon(
                        cardType: CardType.visa,
                        cardImage: Image.asset(
                          'assets/cardPayment/mastercard.256x198.png',
                          height: 48, // Adjust the size to fit your layout
                          width: 48,
                        ),
                      ),
                    ],
                  ),
                  CreditCardForm(
                    formKey: _creditCardFormKey,
                    obscureCvv: true,
                    obscureNumber: true,
                    cardNumber: cardNumber,
                    expiryDate: expiryDate,
                    cardHolderName: cardHolderName,
                    cvvCode: cvvCode,
                    onCreditCardModelChange:
                        _onCreditCardModelChange, // Update values
                    inputConfiguration: const InputConfiguration(
                      cardNumberDecoration: InputDecoration(
                        labelText: 'Number',
                        hintText: 'XXXX XXXX XXXX XXXX',
                      ),
                      expiryDateDecoration: InputDecoration(
                        labelText: 'Expired Date',
                        hintText: 'XX/XX',
                      ),
                      cvvCodeDecoration: InputDecoration(
                        labelText: 'CVV',
                        hintText: 'XXX',
                      ),
                      cardHolderDecoration: InputDecoration(
                        labelText: 'Card Holder',
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: isLoading
                      ? const LoadingSpinner()
                      : ElevatedButton(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: defaultColors.primaryColor,
                            padding: const EdgeInsets.symmetric(vertical: 16),
                          ),
                          onPressed: _onPlaceOrder,
                          child: const Text('Place Order',
                              style:
                                  TextStyle(fontSize: 18, color: Colors.white)),
                        ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _onCreditCardModelChange(CreditCardModel creditCardModel) {
    setState(() {
      cardNumber = creditCardModel.cardNumber;
      expiryDate = creditCardModel.expiryDate;
      cardHolderName = creditCardModel.cardHolderName;
      cvvCode = creditCardModel.cvvCode;
      isCvvFocused = creditCardModel.isCvvFocused;
    });
  }

  void _showPaymentMethodBottomSheet() {
    showModalBottomSheet(
      context: context,
      builder: (BuildContext context) {
        return Container(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Select Payment Method',
                  style: Theme.of(context).textTheme.titleLarge),
              const SizedBox(height: 16),
              ListTile(
                leading: const Icon(Icons.money),
                title: const Text('Cash on Delivery'),
                onTap: () {
                  setState(() {
                    _selectedPaymentMethod = 'Cash on Delivery';
                    paymentMethodError = false;
                  });
                  Navigator.pop(context);
                },
              ),
              ListTile(
                leading: const Icon(Icons.credit_card),
                title: const Text('Card Payment'),
                onTap: () {
                  setState(() {
                    _selectedPaymentMethod = 'Card Payment';
                    paymentMethodError = false;
                  });
                  Navigator.pop(context);
                },
              ),
            ],
          ),
        );
      },
    );
  }

  void _onPlaceOrder() async {
    final cartProvider = Provider.of<CartProvider>(context, listen: false);
    final userProvider = Provider.of<UserIdProvider>(context, listen: false);

    if (_formKey.currentState!.validate()) {
      if (_selectedPaymentMethod == null) {
        setState(() {
          paymentMethodError = true;
        });
        return;
      }

      if (_selectedPaymentMethod == "Card Payment") {
        if (!_creditCardFormKey.currentState!.validate()) {
          return;
        } else {
          setState(() {
            isLoading = true;
          });
          try {
            await Future.delayed(const Duration(seconds: 2));
            if (mounted) {
              await paymentMethodErrorDialog(context);
            }
          } catch (e) {
            //
          } finally {
            setState(() {
              isLoading = false;
            });
          }
          return;
        }
      }

      setState(() {
        isLoading = true;
        paymentMethodError = false; // Reset error flag if method is selected
      });

      _formKey.currentState!.save();

      try {
        for (var item in cartProvider.cartItems.value) {
          final mealData = await _dbService.getMealById(item.recipieId);
          final chefData = await _dbService.getCheff(item.kitchenId);
          final customerData =
              await _dbService.getCustomer(userProvider.getUuid.toString());

          // Add order to the real-time database
          await _realDataBaseService.addOrder(
            customerId: userProvider.getUuid.toString(),
            kitchenId: item.kitchenId,
            address: _addressController.text,
            mealId: item.recipieId,
            mealPicture: mealData!['mealPicture'] ?? '',
            quantity: item.quantity,
            orderDate: DateTime.now().toString(),
            recipe: item.recipie,
            kitchenAddress: chefData['address'] ?? '',
            kitchenName: chefData['kitchenName'],
            mealName: mealData['mealName'],
            price: mealData['price'],
            customerName:
                "${customerData['firstName']} ${customerData['lastName']}",
            originalRecipe: mealData['recipie'],
          );

          // Notify chef via the custom backend
          try {
            await callBackendEndpoint('/notifyChef', {
              'chefId': item.kitchenId,
              'title': 'New Order',
              'body': 'A Customer placed an order of ${item.name.toString()}',
            });
          } catch (e) {
            debugPrint('Error notifying chef: $e');
            // Non-critical: order was still placed even if notification fails
          }
        }

        _processOrder(cartProvider);
      } catch (e) {
        debugPrint("Error placing order: $e");
        // Handle any other error scenarios here
      } finally {
        setState(() {
          isLoading = false;
        });
      }
    }
  }

  void _processOrder(CartProvider cartProvider) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Order Placed'),
        content: const Text('Your order has been successfully placed!'),
        actions: [
          TextButton(
            onPressed: () {
              cartProvider.clearCart();
              Navigator.of(context).popUntil((route) => route.isFirst);
              context.go('/cart');
            },
            child: const Text('OK'),
          ),
        ],
      ),
    );
  }
}
