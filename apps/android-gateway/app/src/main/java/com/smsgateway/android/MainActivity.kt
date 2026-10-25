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
import androidx.core.content.ContextCompat
import com.smsgateway.android.service.SmsForegroundService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
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
                                                    startForegroundService()
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
}
