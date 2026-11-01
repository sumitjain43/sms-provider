package com.smsgateway.android

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import android.telephony.SmsManager
import androidx.core.content.ContextCompat
import com.smsgateway.android.service.SmsForegroundService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

class MainActivity : ComponentActivity() {

    private val httpClient = OkHttpClient()

    private val requestPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val smsGranted = permissions[Manifest.permission.SEND_SMS] == true
        if (smsGranted) {
            Toast.makeText(this, "SMS Permission granted", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this, "SMS Permission is required to send messages", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        checkAndRequestPermissions()

        val prefs = getSharedPreferences("sms_gateway_prefs", Context.MODE_PRIVATE)
        if (prefs.contains("device_token")) {
            startForegroundService()
        }

        setContent {
            MaterialTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    var apiBaseUrl by remember { mutableStateOf(prefs.getString("api_base_url", "http://10.0.2.2:8080") ?: "") }
                    var pairingSessionId by remember { mutableStateOf("") }
                    var pairingCode by remember { mutableStateOf("") }
                    var deviceName by remember { mutableStateOf("Android SIM Gateway") }
                    var isPaired by remember { mutableStateOf(prefs.contains("device_token")) }
                    var statusMessage by remember { mutableStateOf("") }
                    var isLoading by remember { mutableStateOf(false) }

                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(
                            text = "SMS Gateway Android",
                            style = MaterialTheme.typography.headlineMedium
                        )

                        if (!isPaired) {
                            Text("Pair your phone with the SMS Gateway Dashboard")

                            OutlinedTextField(
                                value = apiBaseUrl,
                                onValueChange = { apiBaseUrl = it },
                                label = { Text("API Base URL") },
                                modifier = Modifier.fillMaxWidth()
                            )

                            OutlinedTextField(
                                value = pairingSessionId,
                                onValueChange = { pairingSessionId = it },
                                label = { Text("Pairing Session ID") },
                                modifier = Modifier.fillMaxWidth()
                            )

                            OutlinedTextField(
                                value = pairingCode,
                                onValueChange = { pairingCode = it },
                                label = { Text("Pairing Code") },
                                modifier = Modifier.fillMaxWidth()
                            )

                            OutlinedTextField(
                                value = deviceName,
                                onValueChange = { deviceName = it },
                                label = { Text("Device Name") },
                                modifier = Modifier.fillMaxWidth()
                            )

                            Button(
                                onClick = {
                                    isLoading = true
                                    statusMessage = "Pairing with gateway..."
                                    CoroutineScope(Dispatchers.IO).launch {
                                        try {
                                            val url = "$apiBaseUrl/v1/devices/pair"
                                            val payload = JSONObject().apply {
                                                put("pairingSessionId", pairingSessionId.trim())
                                                put("code", pairingCode.trim())
                                                put("deviceName", deviceName.trim())
                                                put("platform", "android")
                                            }

                                            val req = Request.Builder()
                                                .url(url)
                                                .post(payload.toString().toRequestBody("application/json".toMediaType()))
                                                .build()

                                            httpClient.newCall(req).execute().use { resp ->
                                                if (resp.isSuccessful) {
                                                    val respJson = JSONObject(resp.body?.string() ?: "{}")
                                                    val token = respJson.getString("deviceToken")
                                                    val devId = respJson.getString("deviceId")

                                                    prefs.edit()
                                                        .putString("api_base_url", apiBaseUrl.trim())
                                                        .putString("device_id", devId)
                                                        .putString("device_token", token)
                                                        .apply()

                                                    isPaired = true
                                                    statusMessage = "Paired successfully! Starting background service..."
                                                    CoroutineScope(Dispatchers.Main).launch {
                                                        startForegroundService()
                                                    }
                                                } else {
                                                    statusMessage = "Pairing failed: ${resp.message}"
                                                }
                                            }
                                        } catch (e: Exception) {
                                            statusMessage = "Error: ${e.message}"
                                        } finally {
                                            isLoading = false
                                        }
                                    }
                                },
                                enabled = !isLoading,
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text(if (isLoading) "Pairing..." else "Complete Pairing")
                            }
                        } else {
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                colors = CardDefaults.cardColors(
                                    containerColor = MaterialTheme.colorScheme.primaryContainer
                                )
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Text("Status: Device Connected & Online", style = MaterialTheme.typography.titleMedium)
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Text("Device ID: ${prefs.getString("device_id", "")}")
                                    Text("Gateway API: ${prefs.getString("api_base_url", "")}")
                                }
                            }

                            LaunchedEffect(isPaired) {
                                if (isPaired) {
                                    while (true) {
                                        val baseUrl = prefs.getString("api_base_url", "") ?: ""
                                        val devId = prefs.getString("device_id", "") ?: ""
                                        val devTok = prefs.getString("device_token", "") ?: ""
                                        if (baseUrl.isNotEmpty() && devId.isNotEmpty() && devTok.isNotEmpty()) {
                                            withContext(Dispatchers.IO) {
                                                dispatchOnce(baseUrl, devId, devTok) { msg ->
                                                    statusMessage = msg
                                                }
                                            }
                                        }
                                        delay(3000)
                                    }
                                }
                            }

                            Button(
                                onClick = {
                                    val baseUrl = prefs.getString("api_base_url", "") ?: ""
                                    val devId = prefs.getString("device_id", "") ?: ""
                                    val devTok = prefs.getString("device_token", "") ?: ""
                                    statusMessage = "Checking server for queued messages..."
                                    CoroutineScope(Dispatchers.IO).launch {
                                        dispatchOnce(baseUrl, devId, devTok) { msg ->
                                            statusMessage = msg
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = MaterialTheme.colorScheme.primary
                                )
                            ) {
                                Text("⚡ Check & Send Queued Messages Now")
                            }

                            Button(
                                onClick = { startForegroundService() },
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Text("Restart Background Worker Service")
                            }

                            OutlinedButton(
                                onClick = {
                                    val stopIntent = Intent(this@MainActivity, SmsForegroundService::class.java).apply {
                                        action = SmsForegroundService.ACTION_STOP
                                    }
                                    stopService(stopIntent)
                                    prefs.edit().clear().apply()
                                    isPaired = false
                                    statusMessage = "Device unlinked."
                                },
                                modifier = Modifier.fillMaxWidth(),
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = MaterialTheme.colorScheme.error
                                )
                            ) {
                                Text("Unpair & Revoke Local Credentials")
                            }
                        }

                        if (statusMessage.isNotEmpty()) {
                            Text(
                                text = statusMessage,
                                style = MaterialTheme.typography.bodyMedium
                            )
                        }
                    }
                }
            }
        }
    }

    private fun checkAndRequestPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.SEND_SMS,
            Manifest.permission.READ_PHONE_STATE
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        val needed = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (needed.isNotEmpty()) {
            requestPermissionLauncher.launch(needed.toTypedArray())
        }
    }

    private fun startForegroundService() {
        val serviceIntent = Intent(this, SmsForegroundService::class.java).apply {
            action = SmsForegroundService.ACTION_START
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }
    }

    private fun dispatchOnce(
        baseUrl: String,
        deviceId: String,
        token: String,
        onStatus: (String) -> Unit
    ) {
        try {
            // Heartbeat
            val hbUrl = "$baseUrl/v1/devices/$deviceId/heartbeat"
            val hbPayload = JSONObject().apply {
                put("platform", "android")
                put("androidVersion", Build.VERSION.RELEASE)
                put("battery", 100)
            }
            val hbReq = Request.Builder()
                .url(hbUrl)
                .header("Authorization", "Bearer $token")
                .post(hbPayload.toString().toRequestBody("application/json".toMediaType()))
                .build()
            httpClient.newCall(hbReq).execute().close()

            // Poll jobs
            val jobsUrl = "$baseUrl/v1/devices/$deviceId/jobs"
            val req = Request.Builder()
                .url(jobsUrl)
                .header("Authorization", "Bearer $token")
                .get()
                .build()

            httpClient.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return
                val bodyStr = resp.body?.string() ?: return
                val json = JSONObject(bodyStr)
                val jobsArray = json.optJSONArray("jobs") ?: return

                for (i in 0 until jobsArray.length()) {
                    val job = jobsArray.getJSONObject(i)
                    val jobId = job.getString("id")
                    val recipient = job.getString("to")
                    val messageText = job.getString("body")

                    onStatus("Dispatching SIM SMS to $recipient...")

                    var success = false
                    var errorMsg: String? = null
                    try {
                        val smsManager: SmsManager = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            getSystemService(SmsManager::class.java)
                                ?: @Suppress("DEPRECATION") SmsManager.getDefault()
                        } else {
                            @Suppress("DEPRECATION") SmsManager.getDefault()
                        }
                        val parts = smsManager.divideMessage(messageText)
                        if (parts.size > 1) {
                            smsManager.sendMultipartTextMessage(recipient, null, parts, null, null)
                        } else {
                            smsManager.sendTextMessage(recipient, null, messageText, null, null)
                        }
                        success = true
                        onStatus("✓ Sent SMS to $recipient via SIM card!")
                    } catch (e: Exception) {
                        errorMsg = e.message ?: "Failed to send SMS"
                        onStatus("Error: $errorMsg")
                    }

                    // Report result
                    val resUrl = "$baseUrl/v1/jobs/$jobId/result"
                    val payload = JSONObject().apply {
                        put("status", if (success) "sent" else "failed")
                        if (errorMsg != null) put("errorMessage", errorMsg)
                    }
                    val reportReq = Request.Builder()
                        .url(resUrl)
                        .header("Authorization", "Bearer $token")
                        .post(payload.toString().toRequestBody("application/json".toMediaType()))
                        .build()
                    httpClient.newCall(reportReq).execute().close()
                }
            }
        } catch (e: Exception) {
            onStatus("Polling error: ${e.message}")
        }
    }
}
