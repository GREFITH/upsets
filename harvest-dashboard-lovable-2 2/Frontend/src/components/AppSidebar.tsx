import { Building2, Package, Home, Megaphone, LayoutDashboard, UserPlus, Users, TrendingUp, Target, Calculator, ChevronDown, BookOpen, Settings, LogOut } from "lucide-react";
import { getLoggedInEmail, logout } from "@/pages/LoginPage";
import { NavLink } from "@/components/NavLink";
import { useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AppBase = "operations" | "sales";

const baseConfig: Record<AppBase, { label: string; icon: typeof LayoutDashboard; rootPath: string }> = {
  operations: { label: "Operations", icon: LayoutDashboard, rootPath: "/dashboard" },
  sales: { label: "Sales", icon: TrendingUp, rootPath: "/sales" },
};

const departmentItems = [
  { title: "B2B Firms", url: "/dashboard/b2b-firms", icon: Building2 },
  { title: "B2B Products", url: "/dashboard/b2b-products", icon: Package },
  { title: "Residential & Consumer", url: "/dashboard/residential", icon: Home },
  { title: "Marketing", url: "/dashboard/marketing", icon: Megaphone },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active base from current path
  const activeBase: AppBase = location.pathname.startsWith("/sales") ? "sales" : "operations";
  const currentBase = baseConfig[activeBase];

  function switchBase(base: AppBase) {
    navigate(baseConfig[base].rootPath);
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader
        className={cn(
          "space-y-3",
          /* Icon rail is 3rem; p-4 clips the 32px mark — center with no horizontal padding when collapsed */
          collapsed ? "px-0 py-3 pb-2 space-y-2" : "p-4",
        )}
      >
        <div className={cn("flex items-center gap-3", collapsed && "w-full justify-center")}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-accent leading-none">
            <span className="text-sm font-bold leading-none text-accent-foreground">U</span>
          </div>
          {!collapsed && (
            <div>
              <h2 className="font-bold text-sm tracking-wide text-sidebar-foreground">UPSPRING</h2>
            </div>
          )}
        </div>

        {/* Base Switcher */}
        {!collapsed && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center justify-between w-full px-3 py-2 rounded-md bg-sidebar-accent/50 hover:bg-sidebar-accent text-sidebar-foreground text-sm font-medium transition-colors">
                <div className="flex items-center gap-2">
                  <currentBase.icon className="h-4 w-4" />
                  <span>{currentBase.label}</span>
                </div>
                <ChevronDown className="h-3.5 w-3.5 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {Object.entries(baseConfig).map(([key, config]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => switchBase(key as AppBase)}
                  className={key === activeBase ? "bg-accent/10 font-medium" : ""}
                >
                  <config.icon className="h-4 w-4 mr-2" />
                  {config.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SidebarHeader>

      <SidebarContent>
        {activeBase === "operations" && (
          <>
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] tracking-widest uppercase">
                Overview
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/dashboard" end activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold">
                        <LayoutDashboard className="h-4 w-4" />
                        {!collapsed && <span>All Departments</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] tracking-widest uppercase">
                Departments
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {departmentItems.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold"
                        >
                          <item.icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] tracking-widest uppercase">
                Operations
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/dashboard/clients" activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold">
                        <BookOpen className="h-4 w-4" />
                        {!collapsed && <span>Client Registry</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/dashboard/freelancers" activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold">
                        <UserPlus className="h-4 w-4" />
                        {!collapsed && <span>Freelancer Assignments</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] tracking-widest uppercase">
                Admin
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/dashboard/employees" activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold">
                        <Users className="h-4 w-4" />
                        {!collapsed && <span>Employee Data</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/dashboard/settings" activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold">
                        <Settings className="h-4 w-4" />
                        {!collapsed && <span>Harvest Settings</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}

        {activeBase === "sales" && (
          <>
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] tracking-widest uppercase">
                Sales
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/sales" end activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold">
                        <TrendingUp className="h-4 w-4" />
                        {!collapsed && <span>Dashboard</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/sales/pipeline" activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold">
                        <Target className="h-4 w-4" />
                        {!collapsed && <span>Pipeline</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                      <NavLink to="/sales/estimator" activeClassName="bg-sidebar-accent text-sidebar-primary font-semibold">
                        <Calculator className="h-4 w-4" />
                        {!collapsed && <span>Project Estimator</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4">
        {(() => {
          const email = getLoggedInEmail() ?? "sarah@upspringpr.com";
          const namePart = email.split("@")[0];
          const displayName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
          const initials = namePart.slice(0, 2).toUpperCase();
          return (
            <div className="flex items-center gap-3 px-2">
              <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center shrink-0">
                <span className="text-sidebar-foreground text-xs font-medium">{initials}</span>
              </div>
              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-sidebar-foreground truncate">{displayName}</p>
                    <p className="text-[10px] text-sidebar-foreground/50 truncate">{email}</p>
                  </div>
                  <button
                    onClick={() => { logout(); navigate("/login"); }}
                    title="Sign out"
                    className="shrink-0 text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          );
        })()}
      </SidebarFooter>
    </Sidebar>
  );
}
