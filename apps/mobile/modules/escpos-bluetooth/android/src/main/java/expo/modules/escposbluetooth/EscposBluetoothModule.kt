package expo.modules.escposbluetooth

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID
import java.util.concurrent.Executors

/**
 * Project-owned Bluetooth SPP bridge for generic ESC/POS printers.
 *
 * No vendor SDK is linked: Android's `BluetoothSocket` speaks the standard
 * serial-port profile (SPP), which is what mainstream 58/80 mm ESC/POS
 * printers expose after pairing. Pairing stays in Android Settings; this
 * module only lists bonded devices and writes bytes to the chosen one.
 */
class EscposBluetoothModule : Module() {
  private val serialPortUuid: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
  private val executor = Executors.newSingleThreadExecutor()

  private fun adapter(): BluetoothAdapter? {
    val context = appContext.reactContext ?: return null
    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    return manager?.adapter
  }

  private fun hasConnectPermission(): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val context = appContext.reactContext ?: return false
    return ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.BLUETOOTH_CONNECT
    ) == PackageManager.PERMISSION_GRANTED
  }

  private fun requireAdapter(): BluetoothAdapter {
    val adapter = adapter()
      ?: throw IllegalStateException("Perangkat ini tidak mendukung Bluetooth.")
    if (!adapter.isEnabled) {
      throw IllegalStateException("Bluetooth mati. Nyalakan Bluetooth lalu coba lagi.")
    }
    return adapter
  }

  override fun definition() = ModuleDefinition {
    Name("EscposBluetooth")

    Function("isAvailable") {
      hasConnectPermission() && adapter()?.isEnabled == true
    }

    Function("listBondedPrinters") {
      if (!hasConnectPermission()) {
        throw IllegalStateException("Izin Bluetooth belum diberikan.")
      }
      requireAdapter().bondedDevices.map { device ->
        mapOf(
          "name" to (device.name?.takeIf { it.isNotBlank() } ?: "Printer"),
          "address" to device.address
        )
      }
    }

    AsyncFunction("print") { address: String, bytes: List<Int>, promise: Promise ->
      if (!hasConnectPermission()) {
        promise.reject("E_PERMISSION", "Izin Bluetooth belum diberikan.", null)
        return@AsyncFunction
      }

      val adapter = try {
        requireAdapter()
      } catch (error: Exception) {
        promise.reject("E_BLUETOOTH", error.message, error)
        return@AsyncFunction
      }

      executor.execute {
        var socket: BluetoothSocket? = null
        try {
          val device = adapter.getRemoteDevice(address)
          adapter.cancelDiscovery()
          socket = device.createRfcommSocketToServiceRecord(serialPortUuid)
          socket.connect()
          socket.outputStream.use { stream ->
            stream.write(bytes.map { it.toByte() }.toByteArray())
            stream.flush()
          }
          promise.resolve(null)
        } catch (error: Exception) {
          promise.reject(
            "E_PRINT",
            error.message ?: "Gagal mengirim data ke printer.",
            error
          )
        } finally {
          try {
            socket?.close()
          } catch (_: Exception) {
            // The print failure is already reported; a close error adds nothing.
          }
        }
      }
    }
  }
}
