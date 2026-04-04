using Microsoft.Extensions.Localization;
using TodoList.Localization;
using Volo.Abp.DependencyInjection;
using Volo.Abp.Ui.Branding;

namespace TodoList;

[Dependency(ReplaceServices = true)]
public class TodoListBrandingProvider : DefaultBrandingProvider
{
    private IStringLocalizer<TodoListResource> _localizer;

    public TodoListBrandingProvider(IStringLocalizer<TodoListResource> localizer)
    {
        _localizer = localizer;
    }

    public override string AppName => _localizer["AppName"];
}
