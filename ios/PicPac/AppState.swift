import SwiftUI
import PhotosUI

/// Общее состояние приложения: вкладка, навигация, избранное, заказы, уведомления, выбор фото, оформление.
@MainActor
final class AppState: ObservableObject {
    enum PickFor: Equatable { case fab, product(Product) }

    @Published var tab: AppTab = .home
    @Published var path = NavigationPath()
    @Published var liked: Set<String> = ["wedding"]
    @Published var userName = "Анна"
    @Published var orders: [Order] = Orders.demo
    @Published var notes: [Note] = [Note(title: "Заказ № 3127 печатается", text: "Следующий этап — сборка и переплёт", time: "13:30")]
    @Published var unread = 1

    @Published var showPicker = false
    @Published var pickerItems: [PhotosPickerItem] = []
    @Published var pickFor: PickFor = .fab
    @Published var thumbs: [UIImage] = []
    @Published var photoCount = 0
    @Published var showUpload = false            // «что сделать из N фото» (после кнопки «+»)
    @Published var checkout: Product? = nil      // оформление заказа
    @Published var showNotes = false
    @Published var toast: String? = nil

    struct Note: Identifiable { let id = UUID(); let title: String; let text: String; let time: String }

    func open(_ p: Product) { path.append(p) }

    func pickPhotos(for target: PickFor) {
        pickFor = target
        pickerItems = []
        showPicker = true
    }

    /// Фото выбраны: грузим до 6 превью, считаем общее число, ведём дальше.
    func loadPicked(_ items: [PhotosPickerItem]) async {
        guard !items.isEmpty else { return }
        photoCount = items.count
        var got: [UIImage] = []
        for item in items.prefix(6) {
            if let data = try? await item.loadTransferable(type: Data.self), let img = UIImage(data: data) { got.append(img) }
        }
        thumbs = got
        switch pickFor {
        case .fab: showUpload = true
        case .product(let p): checkout = p
        }
    }

    func placeOrder(_ p: Product, total: Double, delivery: String) {
        let id = String(3128 + orders.count)
        let now = Date().formatted(.dateTime.hour().minute())
        let order = Order(id: id, product: p, total: total, stages: [
            Stage(name: "Принят", note: "\(photoCount) фото · \(delivery)", time: now, state: 2),
            Stage(name: "Проверка макета", note: "Смотрим резкость и поля", time: nil, state: 1),
            Stage(name: "Печать", note: "", time: nil, state: 0),
            Stage(name: "Сборка", note: "", time: nil, state: 0),
            Stage(name: "Контроль качества", note: "", time: nil, state: 0),
            Stage(name: "Доставка", note: delivery, time: nil, state: 0),
        ])
        orders.insert(order, at: 0)
        notes.insert(Note(title: "Заказ № \(id) принят", text: "\(p.name) · оплата при получении", time: now), at: 0)
        unread += 1
        checkout = nil
        path = NavigationPath()
        withAnimation(.spring(duration: 0.4)) { tab = .orders }
        say("Заказ № \(id) оформлен")
    }

    func say(_ text: String) {
        withAnimation(.spring(duration: 0.35)) { toast = text }
        Task { try? await Task.sleep(for: .seconds(2.4)); withAnimation(.easeOut(duration: 0.25)) { if toast == text { toast = nil } } }
    }
}
