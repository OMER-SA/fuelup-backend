import 'dart:convert';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

const String backendBaseUrl = 'https://fuelup-backend-xqii.onrender.com';

Future<Map<String, dynamic>> callBackendEndpoint(
  String path,
  Map<String, dynamic> data,
) async {
  final uri = Uri.parse('$backendBaseUrl$path');
  final headers = <String, String>{
    'Content-Type': 'application/json',
  };

  final user = FirebaseAuth.instance.currentUser;
  if (user != null) {
    headers['Authorization'] = 'Bearer ${await user.getIdToken()}';
  }

  final response = await http.post(
    uri,
    headers: headers,
    body: jsonEncode({'data': data}),
  );

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw Exception(
      'Backend request failed (${response.statusCode}): ${response.body}',
    );
  }

  if (response.body.isEmpty) {
    return const {};
  }

  final decoded = jsonDecode(response.body);
  if (decoded is Map<String, dynamic>) {
    return decoded;
  }

  return const {};
}