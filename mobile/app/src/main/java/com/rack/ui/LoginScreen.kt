package com.rack.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.rack.net.SessionStore
import com.rack.net.SupabaseClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun LoginScreen(session: SessionStore, onLoggedIn: () -> Unit) {
    val scope = rememberCoroutineScope()
    val api = remember { SupabaseClient() }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Rack", style = androidx.compose.material3.MaterialTheme.typography.headlineMedium)
        Text("Escaneo de muebles")
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Email") },
            modifier = Modifier.padding(top = 16.dp),
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Contraseña") },
            visualTransformation = PasswordVisualTransformation(),
            modifier = Modifier.padding(top = 8.dp),
        )
        error?.let { Text(it, modifier = Modifier.padding(top = 8.dp)) }
        Button(
            enabled = !loading,
            modifier = Modifier.padding(top = 16.dp),
            onClick = {
                loading = true
                error = null
                scope.launch {
                    try {
                        val resp = withContext(Dispatchers.IO) { api.signIn(email.trim(), password) }
                        session.accessToken = resp.accessToken
                        session.userId = resp.user.id
                        val profile = withContext(Dispatchers.IO) {
                            api.fetchProfile(resp.accessToken, resp.user.id)
                        }
                        session.role = profile?.role
                        session.storeId = profile?.storeId
                        onLoggedIn()
                    } catch (e: Exception) {
                        error = e.message
                    } finally {
                        loading = false
                    }
                }
            },
        ) {
            if (loading) CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp))
            Text("Ingresar")
        }
    }
}
