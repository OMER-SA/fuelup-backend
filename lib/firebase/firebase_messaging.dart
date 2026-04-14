import 'package:diet_app/firebase/db_service.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class FirebaseNotificationService {
  final DBService _dbService = DBService();

  static final FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin =
      FlutterLocalNotificationsPlugin();

  final FirebaseMessaging _firebaseMessaging = FirebaseMessaging.instance;

  Future<String?> getFCMToken() async {
    await _firebaseMessaging.requestPermission();
    final fCMToken = await _firebaseMessaging.getToken();
    return fCMToken;
  }

  Future<void> initialize({required String userID}) async {
    const AndroidInitializationSettings initializationSettingsAndroid =
        AndroidInitializationSettings('@mipmap/ic_launcher');

    const DarwinInitializationSettings darwinInitializationSettings =
        DarwinInitializationSettings(
      requestAlertPermission: true,
      requestBadgePermission: true,
      requestSoundPermission: true,
    );

    final InitializationSettings initializationSettings =
        InitializationSettings(
      android: initializationSettingsAndroid,
      iOS: darwinInitializationSettings,
    );

    await flutterLocalNotificationsPlugin.initialize(initializationSettings);

    FirebaseMessaging.instance.requestPermission();

    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      _showNotification(message);
    });

    FirebaseMessaging.instance.getToken().then((token) async {
      if (token != null) {
        await _dbService.updateFCMToken(fcmToken: token, userID: userID);
      }
    });

    FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
      await _dbService.updateFCMToken(fcmToken: newToken, userID: userID);
    });
  }

  static Future<void> _showNotification(RemoteMessage message) async {
    RemoteNotification? notification = message.notification;
    AndroidNotification? android = message.notification?.android;

    if (notification != null && android != null) {
      const AndroidNotificationDetails androidPlatformChannelSpecifics =
          AndroidNotificationDetails(
        'channel_id',
        'channel_name',
        importance: Importance.max,
        priority: Priority.high,
        icon: '@mipmap/ic_launcher',
      );
      const NotificationDetails platformChannelSpecifics =
          NotificationDetails(android: androidPlatformChannelSpecifics);
      await flutterLocalNotificationsPlugin.show(
        notification.hashCode,
        notification.title,
        notification.body,
        platformChannelSpecifics,
      );
    }
  }

  // Push notifications are now handled by the custom backend:
  //
  // 1. Customer → Chef notifications:
  //    POST /notifyChef on the Render backend.
  //
  // 2. Chef → Customer notifications (order status updates):
  //    Handled by the backend listener process when the chef
  //    updates the order status.
  //    No client-side code needed.
}
