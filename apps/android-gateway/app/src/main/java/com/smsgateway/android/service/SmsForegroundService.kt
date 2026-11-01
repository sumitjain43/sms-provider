package com.smsgateway.android.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.telephony.SmsManager
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.*
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class SmsForegroundService : Service() {

    private val serviceScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private val httpClient = OkHttpClient()
    private var isRunning = false

    companion object {
        const val CHANNEL_ID = "sms_gateway_channel"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START = "ACTION_START"
        const val ACTION_STOP = "ACTION_STOP"
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                isRunning = false
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            else -> {
                startInForeground()
                if (!isRunning) {
                    isRunning = true
                    startGatewayWorkers()
                }
            }
        }
        return START_STICKY
    }

    private fun startInForeground() {
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("SMS Gateway Active")
            .setContentText("Listening for queued SMS dispatch jobs via SIM")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun startGatewayWorkers() {
        val prefs = getSharedPreferences("sms_gateway_prefs", Context.MODE_PRIVATE)
        val apiBaseUrl = prefs.getString("api_base_url", "") ?: ""
        val deviceId = prefs.getString("device_id", "") ?: ""
        val deviceToken = prefs.getString("device_token", "") ?: ""

        if (apiBaseUrl.isEmpty() || deviceId.isEmpty() || deviceToken.isEmpty()) {
            return
        }

        // Heartbeat worker (every 30 seconds)
        serviceScope.launch {
            while (isRunning) {
                try {
                    sendHeartbeat(apiBaseUrl, deviceId, deviceToken)
                } catch (_: Exception) {}
                delay(30000)
            }
        }

        // Job Polling worker (every 3 seconds)
        serviceScope.launch {
            while (isRunning) {
                try {
                    pollAndSendJobs(apiBaseUrl, deviceId, deviceToken)
                } catch (_: Exception) {}
                delay(3000)
            }
        }
    }

    private fun sendHeartbeat(baseUrl: String, deviceId: String, token: String) {
        val url = "$baseUrl/v1/devices/$deviceId/heartbeat"
        val payload = JSONObject().apply {
            put("platform", "android")
            put("androidVersion", Build.VERSION.RELEASE)
            put("battery", 90)
        }

        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $token")
            .post(payload.toString().toRequestBody("application/json".toMediaType()))
            .build()

        httpClient.newCall(request).execute().close()
    }

    private fun pollAndSendJobs(baseUrl: String, deviceId: String, token: String) {
        val url = "$baseUrl/v1/devices/$deviceId/jobs"
        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $token")
            .get()
            .build()

        httpClient.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return
            val bodyStr = response.body?.string() ?: return
            val json = JSONObject(bodyStr)
            val jobsArray = json.optJSONArray("jobs") ?: return

            for (i in 0 until jobsArray.length()) {
                val job = jobsArray.getJSONObject(i)
                val jobId = job.getString("id")
                val recipient = job.getString("to")
                val messageText = job.getString("body")

                sendSmsViaSim(baseUrl, jobId, token, recipient, messageText)
            }
        }
    }

    private fun sendSmsViaSim(
        baseUrl: String,
        jobId: String,
        token: String,
        recipient: String,
        messageText: String
    ) {
        var success = false
        var errorMsg: String? = null

        try {
            val smsManager: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                applicationContext.getSystemService(SmsManager::class.java)
                    ?: @Suppress("DEPRECATION") SmsManager.getDefault()
            } else {
                @Suppress("DEPRECATION")
                SmsManager.getDefault()
            }

            // Split into multipart if > 160 GSM chars
            val parts = smsManager.divideMessage(messageText)
            if (parts.size > 1) {
                smsManager.sendMultipartTextMessage(recipient, null, parts, null, null)
            } else {
                smsManager.sendTextMessage(recipient, null, messageText, null, null)
            }
            success = true
        } catch (e: Exception) {
            errorMsg = e.message ?: "Failed to dispatch SMS via Android SmsManager"
        }

        reportJobResult(baseUrl, jobId, token, success, errorMsg)
    }

    private fun reportJobResult(
        baseUrl: String,
        jobId: String,
        token: String,
        success: Boolean,
        errorMsg: String?
    ) {
        val url = "$baseUrl/v1/jobs/$jobId/result"
        val payload = JSONObject().apply {
            put("status", if (success) "sent" else "failed")
            if (errorMsg != null) {
                put("errorMessage", errorMsg)
            }
        }

        val request = Request.Builder()
            .url(url)
            .header("Authorization", "Bearer $token")
            .post(payload.toString().toRequestBody("application/json".toMediaType()))
            .build()

        try {
            httpClient.newCall(request).execute().close()
        } catch (_: Exception) {}
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "SMS Gateway Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the SMS Gateway connected and polls queued messages"
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        serviceScope.cancel()
    }
}
