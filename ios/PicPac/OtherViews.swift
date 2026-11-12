import SwiftUI

/// Подбор продукта — по образцу шторки «Search places»: повод, формат, количество, бюджет, тип.
struct FilterSheet: View {
    @Binding var category: String
    @Environment(\.dismiss) private var dismiss
    @State private var pages = 20
    @State private var copies = 1
    @State private var lo: Double = 0.25
    @State private var hi: Double = 0.7
    @State private var type = "Все"
    private let bars: [Double] = [0.15, 0.22, 0.3, 0.42, 0.55, 0.78, 0.92, 1, 0.86, 0.74, 0.6, 0.45, 0.33, 0.24, 0.18, 0.12, 0.09, 0.06]

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                ZStack { Text("Подбор продукта").font(.system(size: 17, weight: .bold))
                    HStack { Spacer(); Button { dismiss() } label: { Image(systemName: "xmark").font(.system(size: 15, weight: .semibold)).foregroundStyle(Theme.ink).frame(width: 36, height: 36) } } }
                VStack(alignment: .leading, spacing: 4) {
                    Text("Заказ — в пару касаний").font(.system(size: 22, weight: .bold)).tracking(-0.5)
                    Text("Расскажите о поводе — покажем подходящее.").font(.system(size: 14.5)).foregroundStyle(Theme.ink3)
                }
                field("Повод", "Свадьба", "chevron.down")
                HStack(spacing: 10) { field("Формат", "20×20 см", "chevron.down"); field("Обложка", "Твёрдая", "chevron.down") }
                HStack(spacing: 10) { stepper("Страницы", $pages, step: 2); stepper("Экземпляры", $copies, step: 1) }

                VStack(alignment: .leading, spacing: 10) {
                    Text("Бюджет").font(.system(size: 15, weight: .semibold))
                    HStack(alignment: .bottom, spacing: 3) {
                        ForEach(bars.indices, id: \.self) { i in
                            let x = Double(i) / Double(bars.count - 1)
                            RoundedRectangle(cornerRadius: 2).fill(x >= lo && x <= hi ? Theme.ink : Color(hex: 0xDADADF)).frame(height: 70 * bars[i])
                        }
                    }.frame(height: 70)
                    RangeTrack(lo: $lo, hi: $hi)
                    HStack(spacing: 10) {
                        priceBox("Мин.", 20 + lo * 180); priceBox("Макс.", 20 + hi * 180)
                    }
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text("Тип").font(.system(size: 15, weight: .semibold))
                    FlowChips(items: ["Все", "Фотокнига", "Печать", "Календарь", "Холст", "Магнит"], selected: $type)
                }

                HStack {
                    Button("Сбросить") { withAnimation { pages = 20; copies = 1; lo = 0.25; hi = 0.7; type = "Все" } }.font(.system(size: 16, weight: .semibold)).foregroundStyle(Theme.ink)
                    Spacer()
                    Button { category = ["Фотокнига": "Фотокниги", "Печать": "Печать", "Календарь": "Календари", "Холст": "Холсты", "Магнит": "Магниты"][type] ?? "Все"; dismiss() } label: {
                        Text("Показать").font(.system(size: 16.5, weight: .semibold)).foregroundStyle(.white).padding(.horizontal, 34).frame(height: 54).background(Capsule().fill(Theme.ink))
                    }.buttonStyle(PressStyle())
                }.padding(.top, 4)
            }
            .padding(20)
        }
        .presentationDetents([.large])
        .presentationCornerRadius(30)
        .presentationDragIndicator(.visible)
    }

    private func field(_ label: String, _ value: String, _ icon: String) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.system(size: 15, weight: .semibold))
            HStack { Text(value); Spacer(); Image(systemName: icon).font(.system(size: 13, weight: .semibold)) }
                .font(.system(size: 16)).padding(.horizontal, 14).frame(height: 50).background(RoundedRectangle(cornerRadius: 14).fill(Theme.field))
        }.frame(maxWidth: .infinity)
    }
    private func stepper(_ label: String, _ v: Binding<Int>, step: Int) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.system(size: 15, weight: .semibold))
            HStack {
                Button { if v.wrappedValue > step { v.wrappedValue -= step } } label: { Image(systemName: "minus").frame(width: 40, height: 40).background(Circle().fill(Theme.chip)) }
                Spacer(); Text("\(v.wrappedValue)").font(.system(size: 17, weight: .semibold)).contentTransition(.numericText()); Spacer()
                Button { v.wrappedValue += step } label: { Image(systemName: "plus").frame(width: 40, height: 40).background(Circle().fill(Theme.chip)) }
            }
            .buttonStyle(PressStyle(scale: 0.88)).foregroundStyle(Theme.ink).animation(.snappy, value: v.wrappedValue)
            .padding(5).background(RoundedRectangle(cornerRadius: 16).stroke(Theme.line, lineWidth: 1.5))
        }.frame(maxWidth: .infinity)
    }
    private func priceBox(_ label: String, _ v: Double) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).font(.system(size: 13)).foregroundStyle(Theme.ink3)
            Text("\(Int(v)) BYN").font(.system(size: 16, weight: .semibold)).padding(.horizontal, 14).frame(maxWidth: .infinity, alignment: .leading).frame(height: 46)
                .background(RoundedRectangle(cornerRadius: 14).stroke(Theme.line, lineWidth: 1.5))
        }
    }
}

struct RangeTrack: View {
    @Binding var lo: Double
    @Binding var hi: Double
    var body: some View {
        GeometryReader { g in
            let w = g.size.width
            ZStack(alignment: .leading) {
                Capsule().fill(Color(hex: 0xE4E4E8)).frame(height: 4)
                Capsule().fill(Theme.ink).frame(width: w * (hi - lo), height: 4).offset(x: w * lo)
                knob.offset(x: w * lo - 13).gesture(DragGesture().onChanged { lo = min(max(0, $0.location.x / w), hi - 0.08) })
                knob.offset(x: w * hi - 13).gesture(DragGesture().onChanged { hi = max(min(1, $0.location.x / w), lo + 0.08) })
            }.frame(height: 28)
        }.frame(height: 28)
    }
    private var knob: some View { Circle().fill(.white).frame(width: 26, height: 26).overlay(Circle().stroke(Theme.ink, lineWidth: 2)).shadow(color: .black.opacity(0.12), radius: 4, y: 2) }
}

struct FlowChips: View {
    let items: [String]
    @Binding var selected: String
    var body: some View {
        let rows = [Array(items.prefix(3)), Array(items.dropFirst(3))]
        VStack(alignment: .leading, spacing: 8) {
            ForEach(rows.indices, id: \.self) { r in
                HStack(spacing: 8) { ForEach(rows[r], id: \.self) { t in Button { withAnimation(.spring(duration: 0.3)) { selected = t } } label: { Chip(title: t, selected: selected == t) }.buttonStyle(PressStyle()) } }
            }
        }
    }
}

/// Заказы: статус по тем же этапам, что видит руководитель в пульте. Этапы отмечают участки производства.
struct OrdersView: View {
    @EnvironmentObject var app: AppState
    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                Text("Заказы").font(.system(size: 28, weight: .bold)).tracking(-0.7).padding(.top, 8)
                ForEach(app.orders) { o in orderCard(o) }
                Text("Этапы отмечают участки производства «Фотопринта» — их же видит руководитель в пульте. Уведомим, когда заказ будет готов.")
                    .font(.system(size: 13.5)).foregroundStyle(Theme.ink3)
            }
            .padding(.horizontal, 20).padding(.bottom, 120)
        }
    }
    private func orderCard(_ o: Order) -> some View {
        let done = o.stages.allSatisfy { $0.state == 2 }
        return VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                ProductArt(kind: o.product.kind, scene: o.product.scene, photo: o.product.photo).frame(width: 60, height: 60).clipShape(RoundedRectangle(cornerRadius: 16))
                VStack(alignment: .leading, spacing: 2) {
                    Text("№ \(o.id)").font(.system(size: 17, weight: .bold))
                    Text(o.product.name).font(.system(size: 14)).foregroundStyle(Theme.ink3)
                }
                Spacer()
                Text(done ? "Вручён" : "В работе").font(.system(size: 12.5, weight: .semibold)).foregroundStyle(done ? Theme.ink3 : .white)
                    .padding(.horizontal, 10).frame(height: 26).background(Capsule().fill(done ? Theme.chip : Theme.ink))
            }
            if !done {
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(o.stages.enumerated()), id: \.element.id) { i, s in
                        HStack(alignment: .top, spacing: 12) {
                            VStack(spacing: 0) {
                                ZStack {
                                    Circle().fill(s.state == 2 ? Theme.ink : .white).frame(width: 26, height: 26)
                                        .overlay(Circle().stroke(s.state == 0 ? Color(hex: 0xDADADF) : Theme.ink, lineWidth: 2))
                                    if s.state == 2 { Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(.white) }
                                    if s.state == 1 { PulseDot() }
                                }
                                if i < o.stages.count - 1 { Rectangle().fill(s.state == 2 ? Theme.ink : Color(hex: 0xE4E4E8)).frame(width: 2, height: 30) }
                            }
                            VStack(alignment: .leading, spacing: 1) {
                                Text(s.name).font(.system(size: 15.5, weight: s.state == 1 ? .bold : .medium)).foregroundStyle(s.state == 0 ? Theme.ink4 : Theme.ink)
                                if !s.note.isEmpty && s.state > 0 { Text(s.note).font(.system(size: 13)).foregroundStyle(Theme.ink3) }
                            }
                            Spacer()
                            if let t = s.time { Text(t).font(.system(size: 12.5, design: .monospaced)).foregroundStyle(Theme.ink3) }
                        }
                    }
                }
            }
        }
        .padding(16).background(RoundedRectangle(cornerRadius: 24).fill(.white).shadow(color: .black.opacity(0.06), radius: 16, y: 6))
        .overlay(RoundedRectangle(cornerRadius: 24).stroke(Theme.line, lineWidth: 1))
    }
}

/// Текущий этап «дышит» — заказ сейчас здесь.
struct PulseDot: View {
    @State private var on = false
    var body: some View {
        Circle().fill(Theme.red).frame(width: 10, height: 10)
            .background(Circle().fill(Theme.red.opacity(0.25)).frame(width: on ? 24 : 10, height: on ? 24 : 10))
            .onAppear { withAnimation(.easeOut(duration: 1.2).repeatForever(autoreverses: false)) { on = true } }
    }
}

struct IdeasView: View {
    @EnvironmentObject var app: AppState
    private func open(_ p: Product) { app.open(p) }
    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 16) {
                Text("Идеи").font(.system(size: 28, weight: .bold)).tracking(-0.7).padding(.top, 8)
                Text("Готовые шаблоны от picPac и работы клиентов.").font(.system(size: 15)).foregroundStyle(Theme.ink3)
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())], spacing: 14) {
                    ForEach(Catalog.products) { p in
                        Button { open(p) } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                ProductArt(kind: p.kind, scene: p.scene, photo: p.photo).frame(height: 170).clipShape(RoundedRectangle(cornerRadius: 20))
                                Text(p.name).font(.system(size: 15, weight: .bold)).foregroundStyle(Theme.ink).lineLimit(1)
                                Text(p.short).font(.system(size: 13)).foregroundStyle(Theme.ink3).lineLimit(1)
                            }
                        }.buttonStyle(PressStyle(scale: 0.97))
                    }
                }
            }.padding(.horizontal, 20).padding(.bottom, 120)
        }
    }
}

struct ProfileView: View {
    @EnvironmentObject var app: AppState
    private var name: String { app.userName }
    @State private var page: String? = nil
    @State private var chat = false
    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                HStack(spacing: 14) {
                    Text(String(name.prefix(1)).uppercased()).font(.system(size: 22, weight: .bold)).foregroundStyle(.white).frame(width: 58, height: 58).background(Circle().fill(Theme.ink))
                    VStack(alignment: .leading, spacing: 2) { Text(name.capitalized).font(.system(size: 20, weight: .bold)); Text("Клиент picPac").font(.system(size: 14)).foregroundStyle(Theme.ink3) }
                }.padding(.top, 12)
                VStack(spacing: 0) {
                    ForEach(["Адреса доставки", "Уведомления о заказе", "Промокоды", "Поддержка", "Помощник Пак", "О приложении"], id: \.self) { r in
                        Button { if r == "Поддержка" { chat = true } else { page = r } } label: {
                            HStack { Text(r).font(.system(size: 16)).foregroundStyle(Theme.ink); Spacer(); Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.ink4) }
                                .frame(height: 56).contentShape(Rectangle())
                        }.buttonStyle(PressStyle(scale: 0.99))
                        if r != "О приложении" { Divider() }
                    }
                }.padding(.horizontal, 16).background(RoundedRectangle(cornerRadius: 22).fill(Theme.field))
            }.padding(.horizontal, 20).padding(.bottom, 120)
        }
        .sheet(item: Binding(get: { page.map { PageID(id: $0) } }, set: { page = $0?.id })) { ProfileDetail(title: $0.id) }
        .sheet(isPresented: $chat) { CatChat().environmentObject(app) }
    }
}

struct PageID: Identifiable { let id: String }
