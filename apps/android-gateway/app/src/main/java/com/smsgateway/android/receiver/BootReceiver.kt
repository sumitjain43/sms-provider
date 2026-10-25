package com.smsgateway.android.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.smsgateway.android.service.SmsForegroundService

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED ||
            intent.action == "android.intent.action.MY_PACKAGE_REPLACED"
        ) {
            val prefs = context.getSharedPreferences("sms_gateway_prefs", Context.MODE_PRIVATE)
            val isConfigured = prefs.contains("device_token")

            if (isConfigured) {
                val serviceIntent = Intent(context, SmsForegroundService::class.java).apply {
                    action = SmsForegroundService.ACTION_START
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent)
                } else {
                    context.startService(serviceIntent)
                }
            }
        }
    }
}
