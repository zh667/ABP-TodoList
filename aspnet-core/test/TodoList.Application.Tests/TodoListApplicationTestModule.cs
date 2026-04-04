using Volo.Abp.Modularity;

namespace TodoList;

[DependsOn(
    typeof(TodoListApplicationModule),
    typeof(TodoListDomainTestModule)
)]
public class TodoListApplicationTestModule : AbpModule
{

}
